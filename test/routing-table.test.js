'use strict'

const assert = require('assert')
const BigNumber = require('bignumber.js')
const RoutingTable = require('../src/lib/routing-table')
const Route = require('../src/lib/route')

const ledgerA = 'ledgerA.'
const ledgerB = 'ledgerB.'
const ledgerC = 'ledgerB.'
const markB = ledgerB + 'mark'
const maryB = ledgerB + 'mary'

describe('RoutingTable', function () {
  describe('addRoute', function () {
    it('stores a route', function () {
      const table = new RoutingTable()
      const route = new Route([], [ledgerA, ledgerB], {})
      table.addRoute(ledgerB, markB, route)
      assert.equal(table.destinations.get(ledgerB).get(markB), route)
    })
  })

  describe('removeRoute', function () {
    it('removes a route', function () {
      const table = new RoutingTable()
      table.addRoute(ledgerB, markB, new Route([], [ledgerA, ledgerB], {}))
      table.removeRoute(ledgerB, markB)
      assert.equal(table.destinations.size(), 0)
    })

    it('ignores nonexistent routes', function () {
      const table = new RoutingTable()
      table.removeRoute(ledgerB, markB)
    })
  })

  describe('getAppliesToPrefix', function () {
    beforeEach(function () {
      this.table = new RoutingTable()
      this.table.addRoute('a.b.c.', 'abc.mark', new Route([], {}))
      this.table.addRoute('a.', 'a.mary', new Route([], {}))
      this.table.addRoute('', 'gateway.martin', new Route([], {}))
    })

    it('returns the shortest prefix that uniquely matches the destination', function () {
      assert.equal(this.table.getAppliesToPrefix('a.b.c.', 'a.b.c.carl'), 'a.b.c.')
      assert.equal(this.table.getAppliesToPrefix('a.b.c.', 'a.b.c.d.carl'), 'a.b.c.')

      assert.equal(this.table.getAppliesToPrefix('a.', 'a.d.carl'), 'a.d.')
      assert.equal(this.table.getAppliesToPrefix('a.', 'a.b.carl'), 'a.b.carl')
      assert.equal(this.table.getAppliesToPrefix('a.', 'a.b.d.carl'), 'a.b.d.')
      assert.equal(this.table.getAppliesToPrefix('', 'random.carl'), 'random.')
    })

    it('returns the full address if the destination has no unique prefix', function () {
      this.table.addRoute('a.b.c.def.', 'a.b.c.def.mark', new Route([], {}))
      assert.equal(this.table.getAppliesToPrefix('a.b.c.', 'a.b.c.carl'), 'a.b.c.carl')
    })
  })

  describe('findBestHopForSourceAmount', function () {
    it('returns the best hop', function () {
      const table = new RoutingTable()
      const routeMark = new Route([[0, 0], [100, 100]], [ledgerA, ledgerB], {})
      const routeMary = new Route([[0, 0], [50, 60]], [ledgerA, ledgerB], {})
      table.addRoute(ledgerB, markB, routeMark)
      table.addRoute(ledgerB, maryB, routeMary)
      assert.deepEqual(table.findBestHopForSourceAmount(ledgerB, 50),
        { bestHop: maryB, bestValue: '60', bestRoute: routeMary })
      assert.deepEqual(table.findBestHopForSourceAmount(ledgerB, 70),
        { bestHop: markB, bestValue: '70', bestRoute: routeMark })
      assert.deepEqual(table.findBestHopForSourceAmount(ledgerB, 200),
        { bestHop: markB, bestValue: '100', bestRoute: routeMark })
    })

    it('returns undefined when there is no route to the destination', function () {
      const table = new RoutingTable()
      assert.strictEqual(table.findBestHopForSourceAmount(ledgerB, 10), undefined)
    })

    it('prefers short routes', function () {
      const table = new RoutingTable()
      const routeMark = new Route([[0, 0], [100, 999]], {sourceLedger: ledgerA, nextLedger: ledgerB, destinationLedger: ledgerB})
      const routeMary = new Route([[0, 0], [100, 100]], {sourceLedger: ledgerA, nextLedger: ledgerC, destinationLedger: ledgerB})
      table.addRoute(ledgerB, markB, routeMark)
      table.addRoute(ledgerB, ledgerC + 'mary', routeMary)
      assert.deepEqual(table.findBestHopForSourceAmount(ledgerB, 50),
        { bestHop: markB, bestValue: '499', bestRoute: routeMark })
    })
  })

  describe('findBestHopForDestinationAmount', function () {
    it('returns the best hop', function () {
      const table = new RoutingTable()
      const routeMark = new Route([[0, 0], [100, 100]], [ledgerA, ledgerB], {})
      const routeMary = new Route([[0, 0], [50, 60]], [ledgerA, ledgerB], {})
      table.addRoute(ledgerB, markB, routeMark)
      table.addRoute(ledgerB, maryB, routeMary)
      assert.deepEqual(table.findBestHopForDestinationAmount(ledgerB, 60),
        { bestHop: maryB, bestCost: '50', bestRoute: routeMary })
      assert.deepEqual(table.findBestHopForDestinationAmount(ledgerB, 70),
        { bestHop: markB, bestCost: '70', bestRoute: routeMark })
    })

    it('returns undefined when there is no route to the destination', function () {
      const table = new RoutingTable()
      assert.strictEqual(table.findBestHopForDestinationAmount(ledgerB, 10), undefined)
    })

    it('returns undefined when no route has a high enough destination amount', function () {
      const table = new RoutingTable()
      table.addRoute(ledgerB, markB, new Route([[0, 0], [100, 100]], [ledgerA, ledgerB], {}))
      assert.strictEqual(table.findBestHopForDestinationAmount(ledgerB, 200), undefined)
    })
  })

  describe('getBetterPath', function () {
    const getBetterPath = RoutingTable._getBetterPath

    it('returns otherPath if there is no currentPath', function () {
      const otherPath = {}
      assert.strictEqual(getBetterPath(null, otherPath), otherPath)
    })

    it('returns the shorter hop', function () {
      const path1 = {pathLength: 1, value: new BigNumber(1)}
      const path2 = {pathLength: 2, value: new BigNumber(2)}
      assert.strictEqual(getBetterPath(path1, path2), path1)
      assert.strictEqual(getBetterPath(path2, path1), path1)
    })

    it('returns the hop with the better value', function () {
      const path1 = {pathLength: 1, value: new BigNumber(1)}
      const path2 = {pathLength: 1, value: new BigNumber(2)}
      assert.strictEqual(getBetterPath(path1, path2), path2)
      assert.strictEqual(getBetterPath(path2, path1), path2)
    })

    it('returns otherPath when otherPath has a value and currentPath doesn\'t', function () {
      const path1 = {pathLength: 1}
      const path2 = {pathLength: 1, value: new BigNumber(1)}
      assert.strictEqual(getBetterPath(path1, path2), path2)
    })

    it('returns the hop with the better cost', function () {
      const path1 = {pathLength: 1, cost: new BigNumber(1)}
      const path2 = {pathLength: 1, cost: new BigNumber(2)}
      assert.strictEqual(getBetterPath(path1, path2), path1)
      assert.strictEqual(getBetterPath(path2, path1), path1)
    })

    it('returns otherPath when otherPath has a cost and currentPath doesn\'t', function () {
      const path1 = {pathLength: 1}
      const path2 = {pathLength: 1, cost: new BigNumber(1)}
      assert.strictEqual(getBetterPath(path1, path2), path2)
    })

    it('returns currentPath if neither hop has a curve', function () {
      const path1 = {pathLength: 1}
      const path2 = {pathLength: 1}
      assert.strictEqual(getBetterPath(path1, path2), path1)
      assert.strictEqual(getBetterPath(path2, path1), path2)
    })
  })
})
