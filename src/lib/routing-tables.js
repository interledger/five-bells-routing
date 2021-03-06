'use strict'

const debug = require('debug')('ilp-routing:routing-tables')
const PrefixMap = require('./prefix-map')
const Route = require('./route')
const RoutingTable = require('./routing-table')
// A next hop of PAIR distinguishes a local pair A→B from a complex route
// that just happens to be local, i.e. when A→C & C→B are local pairs.
const PAIR = 'PAIR'

class RoutingTables {
  /**
   * @param {Object[]} localRoutes
   * @param {Integer} expiryDuration milliseconds
   */
  constructor (localRoutes, expiryDuration) {
    this.currentEpoch = 0
    // todo: remove the expiry logic from here (hold-down should be set by the originator of the route) ; for now, I'm just assuming an acceptable initial expiry, and bumping it when heartbeats are received
    this.expiryDuration = expiryDuration
    this.sources = new PrefixMap() // { "sourceLedger" => RoutingTable }
    this.localAccounts = {} // { "ledger" ⇒ accountURI }
    this.addLocalRoutes(localRoutes)
  }

  incrementEpoch () {
    this.currentEpoch++
  }

  /**
   * @param {RouteData[]|Route[]} localRoutes - Each local route should include the optional
   *   `destinationAccount` parameter.
   */
  addLocalRoutes (_localRoutes) {
    const localRoutes = _localRoutes.map((route) => Route.fromData(route, this.currentEpoch))
    for (const localRoute of localRoutes) {
      localRoute.isLocal = true
      const table = this.sources.get(localRoute.sourceLedger) ||
        this.sources.insert(localRoute.sourceLedger, new RoutingTable())
      table.addRoute(localRoute.destinationLedger, PAIR, localRoute)

      this.localAccounts[localRoute.sourceLedger] = localRoute.sourceAccount
      if (localRoute.destinationAccount) {
        this.localAccounts[localRoute.destinationLedger] = localRoute.destinationAccount
      }
    }
    localRoutes.forEach((route) => this.addRoute(route))
  }

  removeLedger (ledger) {
    debug('removeLedger ledger:', ledger)
    const removeList = []
    this.eachRoute((routeFromAToB, ledgerA, ledgerB, nextHop) => {
      if (ledgerA === ledger || ledgerB === ledger) {
        removeList.push({ ledgerA, ledgerB, nextHop })
      }
    })
    removeList.forEach((route) => {
      this._removeRoute(route.ledgerA, route.ledgerB, route.nextHop)
    })
  }

  /**
   * Given a `route` B→C, create a route A→C for each source ledger A with a
   * local route to B.
   *
   * @param {Route|RouteData} _route from ledger B→C
   * @returns {Boolean} whether or not a new route was added
   */
  addRoute (_route, noExpire) {
    const route = Route.fromData(_route, this.currentEpoch)
    let added = false
    this.eachSource((tableFromA, ledgerA) => {
      added = this._addRouteFromSource(tableFromA, ledgerA, route, noExpire) || added
    })
    if (added) {
      debug('added route matching ', route.targetPrefix, ':', route.sourceAccount, route.destinationLedger, 'epoch:', route.addedDuringEpoch)
      this.incrementEpoch()
    }

    return added
  }

  _addRouteFromSource (tableFromA, ledgerA, routeFromBToC, noExpire) {
    const ledgerB = routeFromBToC.sourceLedger
    const ledgerC = routeFromBToC.targetPrefix
    const connectorFromBToC = routeFromBToC.sourceAccount
    let added = false

    // Don't create local route A→B→C if local route A→C already exists.
    if (routeFromBToC.isLocal && this.getLocalPairRoute(ledgerA, ledgerC)) {
      return
    }
    // Don't create A→B→C when A→B is not a local pair.
    const routeFromAToB = this.getLocalPairRoute(ledgerA, ledgerB)
    if (!routeFromAToB) {
      return
    }

    // Make sure the routes can be joined.
    const expiryDuration = noExpire ? null : this.expiryDuration
    const routeFromAToC = routeFromAToB.join(routeFromBToC, expiryDuration, this.currentEpoch)
    if (!routeFromAToC) {
      return
    }

    if (!this._getRoute(ledgerA, ledgerC, connectorFromBToC)) {
      added = true
      routeFromAToC.addedDuringEpoch++
    }
    tableFromA.addRoute(ledgerC, connectorFromBToC, routeFromAToC)

    // Given pairs A↔B,B→C; on addRoute(C→D) create A→D after creating B→D.
    if (added) added = this.addRoute(routeFromAToC) || added
    return added
  }

  _removeRoute (ledgerB, ledgerC, connectorFromBToC) {
    let lostLedgerLinks = []
    this.eachSource((tableFromA, ledgerA) => {
      if (ledgerA !== ledgerB) return
      if (tableFromA.removeRoute(ledgerC, connectorFromBToC)) {
        lostLedgerLinks.push(ledgerC)
      }
    })
    return lostLedgerLinks
  }

  removeExpiredRoutes () {
    let lostLedgerLinks = []
    this.eachRoute((routeFromAToB, ledgerA, ledgerB, nextHop) => {
      if (routeFromAToB.isExpired()) {
        debug('removing expired route ledgerA:', ledgerA, ' ledgerB:', ledgerB, ' nextHop:', nextHop)
        let lll = this._removeRoute(ledgerA, ledgerB, nextHop)
        lostLedgerLinks.push(...lll)
      }
    })
    return lostLedgerLinks
  }

  bumpConnector (connectorAccount, holdDownTime) {
    this.eachRoute((route, ledgerA, ledgerB, nextHop) => {
      if (connectorAccount === nextHop) {
        debug('bumping route ledgerA:', ledgerA, ' ledgerB:', ledgerB, ' nextHop:', nextHop)
        route.bumpExpiration(holdDownTime)
      }
    })
  }

  invalidateConnector (connectorAccount) {
    debug('invalidateConnector connectorAccount:', connectorAccount)
    let lostLedgerLinks = []
    this.eachSource((table, sourceLedger) => {
      table.destinations.each((_routes, destination) => {
        const routeToRemove = _routes.get(connectorAccount)
        // Don't invalidate static routes.
        if (!routeToRemove || routeToRemove.expiresAt === null) return
        if (table.removeRoute(destination, connectorAccount)) {
          lostLedgerLinks.push(destination)
        }
      })
    })
    return lostLedgerLinks
  }

  invalidateConnectorsRoutesTo (connectorAccount, ledger) {
    debug('invalidateConnectorsRoutesTo connectorAccount:', connectorAccount, ' ledger:', ledger)
    let lostLedgerLinks = []
    this.eachSource((table, sourceLedger) => {
      const routeToRemove = this._getRoute(sourceLedger, ledger, connectorAccount)
      // Don't invalidate static routes.
      if (!routeToRemove || routeToRemove.expiresAt === null) return
      if (table.removeRoute(ledger, connectorAccount)) {
        lostLedgerLinks.push(ledger)
      }
    })
    return lostLedgerLinks
  }

  /**
   * @param {function(tableFromA, ledgerA)} fn
   */
  eachSource (fn) { this.sources.each(fn) }

  /**
   * @param {function(routeFromAToB, ledgerA, ledgerB, nextHop)} fn
   */
  eachRoute (fn) {
    this.eachSource((tableFromA, ledgerA) => {
      tableFromA.destinations.each((routesFromAToB, ledgerB) => {
        for (const nextHop of routesFromAToB.keys()) {
          const routeFromAToB = routesFromAToB.get(nextHop)
          fn(routeFromAToB, ledgerA, ledgerB, nextHop)
        }
      })
    })
  }

  /**
   * @param {Integer} maxPoints
   * @returns {Routes}
   */
  toJSON (maxPoints) {
    if (typeof maxPoints !== 'number' || maxPoints <= 0) {
      throw new TypeError('RoutingTables#toJSON maxPoints must be a positive number')
    }
    const routes = []
    this.eachSource((table, sourceLedger) => {
      table.destinations.each((routesByConnector, destinationLedger) => {
        const combinedRoute = combineRoutesByConnector(routesByConnector, maxPoints)
        const combinedRouteData = combinedRoute.toJSON()
        combinedRouteData.source_account = this.localAccounts[combinedRoute.sourceLedger]
        routes.push(combinedRouteData)
      })
    })
    return routes
  }

  toDebugStrings () {
    const routes = []
    this.eachSource((table, sourceLedger) => {
      table.destinations.each((routesByConnector, destinationLedger) => {
        routesByConnector.forEach((route, connector) => {
          routes.push(route.toDebugString(connector))
        })
      })
    })
    return routes
  }

  /**
   * @param {IlpAddress} sourceLedger
   * @param {IlpAddress} nextLedger
   * @returns {Route}
   */
  getLocalPairRoute (sourceLedger, nextLedger) {
    return this._getRoute(sourceLedger, nextLedger, PAIR)
  }

  _getRoute (ledgerA, ledgerB, nextHop) {
    const routesFromAToB = this.sources.get(ledgerA).destinations.get(ledgerB)
    if (!routesFromAToB) return
    return routesFromAToB.get(nextHop)
  }

  /**
   * @param {IlpAddress} sourceAddress
   * @param {IlpAddress} finalAddress
   * @param {String} sourceAmount
   * @returns {Object}
   */
  findBestHopForSourceAmount (sourceAddress, finalAddress, sourceAmount) {
    debug('searching best hop from %s to %s for %s (by src amount)', sourceAddress, finalAddress, sourceAmount)
    const table = this.sources.resolve(sourceAddress)
    if (!table) {
      debug('source %s is not in known sources: %s',
        sourceAddress, Object.keys(this.sources.prefixes))
      return undefined
    }
    return this._rewriteLocalHop(
      table.findBestHopForSourceAmount(finalAddress, sourceAmount))
  }

  /**
   * Find the best intermediate route to use after `sourceLedger` on the way to `finalLedger`.
   *
   * @param {IlpAddress} sourceAddress
   * @param {IlpAddress} finalAddress
   * @param {String} finalAmount
   * @returns {Object}
   */
  findBestHopForDestinationAmount (sourceAddress, finalAddress, finalAmount) {
    debug('searching best hop from %s to %s for %s (by dst amount)', sourceAddress, finalAddress, finalAmount)
    const table = this.sources.resolve(sourceAddress)
    if (!table) {
      debug('source %s is not in known sources: %s',
        sourceAddress, Object.keys(this.sources.prefixes))
      return undefined
    }
    return this._rewriteLocalHop(
      table.findBestHopForDestinationAmount(finalAddress, finalAmount))
  }

  _rewriteLocalHop (hop) {
    if (hop && hop.bestHop === PAIR) {
      hop.bestHop = this.localAccounts[hop.bestRoute.destinationLedger]
    }
    return hop
  }
}

function combineRoutesByConnector (routesByConnector, maxPoints) {
  const routes = routesByConnector.values()
  let totalRoute = routes.next().value
  for (const subRoute of routes) {
    totalRoute = totalRoute.combine(subRoute)
  }
  return totalRoute.simplify(maxPoints)
}

module.exports = RoutingTables
