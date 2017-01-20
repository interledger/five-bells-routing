# ilp-routing

> ILP routing table implementation

## API Reference

### Route

`RouteData` refers to the [Routes schema](https://github.com/interledgerjs/five-bells-shared/blob/master/schemas/Routes.json) in five-bells-shared.

#### `new Route(curve, hops, info)`
#### `Route.fromData(routeData) ⇒ Route`
#### `route.amountAt(x) ⇒ Number`

Given a source amount, look up the corresponding destination amount.

#### `route.amountReverse(y) ⇒ Number`

Given a destination amount, look up the corresponding source amount.

#### `route.getPoints(y) ⇒ Point[]`

#### `route.combine(alternateRoute) ⇒ Route`

Combine two parallel routes, generating a new curve consisting of the best segments of each.

#### `route.join(tailRoute) ⇒ Route`

Compose two routes end-to-end: `A→B.join(B→C)` becomes `A→C`.

#### `route.shiftX(dx) ⇒ Route`

Shift a route's curve left or right.

#### `route.shiftY(dy) ⇒ Route`

Shift a route's curve up or down.

#### `route.simplify(maxPoints) ⇒ Route`

Simplify a route.

#### `route.isExpired() ⇒ Boolean`

Check if a route has expired.

#### `route.toJSON() ⇒ RouteData`

### RoutingTables

#### `new RoutingTables(baseURI, localRoutes, expiryDuration)`
#### `tables.addLocalRoutes(localRouteObjects)`
#### `tables.addRoute(routeObject) ⇒ Boolean`

Returns whether or not a new route was created (updates don't count).

#### `tables.removeLedger(ledger)`
#### `tables.removeExpiredRoutes()`
#### `tables.toJSON(maxPoints) ⇒ RouteData[]`
#### `tables.findBestHopForDestinationAmount(ledgerA, ledgerC, finalAmount) ⇒ Hop`
#### `tables.findBestHopForSourceAmount(ledgerA, ledgerC, sourceAmount) ⇒ Hop`
