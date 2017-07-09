[![npm version](https://badge.fury.io/js/redux-socket-cluster.svg)](https://badge.fury.io/js/redux-socket-cluster)

# redux-socket-cluster
A socket-cluster state snatcher

## WIP - Thoughts & PRs welcome!

Socket cluster is awesome, but it doesn't share it's state, so you always have to go to your stored socket to find out. 
This tiny package grabs all the tasty little state bits & sticks em in your redux store. 
Then, it sets up listeners for updates to keep those state bits nice and fresh.
This makes it super easy to do things like "Please wait, reconnecting" modals without having to access the socket.
More complex examples might be getting kicked off a subscription & pushing a 
"You got booted from the chat room. Sending you to the lobby..."

## Installation

`npm i -S redux-socket-cluster`

## API
###`socketClusterReducer` - the reducer. 

add this to your rootReducer, maybe something like this:
```
import {socketClusterReducer} from 'redux-socket-cluster`;
function reducer(state, action) {
  return {
    routing: routeReducer(state.routing, action),
    ...,
    socket: socketClusterReducer(state.socket, action)
  }
}
```
This initial state object is an Object that looks like this:

```
  id: null,
  socketState: CLOSED,
  authState: PENDING,
  authToken: null,
  authError: null,
  error: null,
  pendingSubs: [],
  subs: []
```
###`reduxSocket(options, hocOptions)` - a HOC to put on your highest level real-time component.
eg `@reduxSocket({authTokenName: 'MyApp.token'}, {keepAlive: 60000})`

For example, if you use websockets for everything, stick this on the main `app`.
If only certain components have websockets, stick this on those containers.
The `options` are identical to what you'd pass in to the client socketCluster
(http://socketcluster.io/#!/docs/api-socketcluster-client).
 
`hocOptions` can be a function that takes in props, or a simple object. If an object, it has the following properties:
- `keepAlive`: The number of milliseconds to keep the socket connection alive after navigating away from the component.
Defaults to 15 seconds.
Say the client subs to 1000 items & accidently clicks a link that unmounts the component,
if they make it back to the component before the time expires, you won't have to start a new connection or resend
those 1000 documents. Plus, any docs that came in while they were away will be there too. Neat!
- `AuthEngine`: a class that takes in a redux `store` and creates a socket cluster `AuthEngine`.
- `onConnect(options, hocOptions, socket)`: a callback that returns an active socket when a connection has been established.
Useful if you want to do something like upgrade a transport from HTTP to sockets
- `onDisconnect(timedOut, options, hocOptions, socket)`: a callback that returns a Boolean that is true due to `keepAlive` expiring
and the now inactive socket.
Similar to above, this is useful if you want to downgrade something from a socket transport to HTTP.

NOTES: 
 - This setup assumes you've already given the client a token (probably via HTTP). If you'd like socket-cluster to 
create a token for you, create an issue with your current workflow & together we can make a pretty API for that usecase.

That's it!

## TODO
- More tests! 
- Add option to create token from socket cluster



## License
MIT
