'use strict'

const assert = require('assert')
const RoutingTable = require('../src/lib/routing-table')
const Route = require('../src/lib/route')

const ledgerA = 'ledgerA.'
const ledgerB = 'ledgerB.'
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
      this.table.addRoute('abc', 'abc.mark', new Route([], {}))
      this.table.addRoute('a', 'a.mary', new Route([], {}))
      this.table.addRoute('', 'gateway.martin', new Route([], {}))
    })

    it('returns the shortest prefix that uniquely matches the target', function () {
      assert.equal(this.table.getAppliesToPrefix('abc', 'abc.carl'), 'abc')
      assert.equal(this.table.getAppliesToPrefix('ab', 'ab.carl'), 'ab.')
      assert.equal(this.table.getAppliesToPrefix('ab', 'abd.carl'), 'abd')

      assert.equal(this.table.getAppliesToPrefix('', 'random.carl'), 'r')
      assert.equal(this.table.getAppliesToPrefix('a', 'ad.carl'), 'ad')
      assert.equal(this.table.getAppliesToPrefix('abc', 'abcd.carl'), 'abc')
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
})
