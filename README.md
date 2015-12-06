# redux-socket-cluster
A socket-cluster state snatcher

###WIP - Thoughts & PRs welcome!

Socket cluster is awesome, but the state is mishmashed all over the place. This tiny package grabs all the tasty little
state bits & sticks em in your redux store. Then, it sets up listeners for updates to keep those state bits nice and fresh.
This makes it super easy to do things like "Please wait, reconnecting" modals. More complex examples might be
getting kicked off a subscription & pushing a "You got booted from the chat room. Sending you to the lobby..."

###Installation

`npm i -S redux-socket-cluster`

###API
####`socketClusterReducer` - the reducer. 

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
This initial state object looks like this:

```
  state: 'closed',
  id: null,
  isAuthenticated: false,
  isAuthenticating: false, //not from socketCluster itself
  lastError: null,
  token: null,
  //connectionError: '', //waiting on v4
  //permissionError: '', //waiting on v4
  //tokenError: '', //waiting on v4
  pendingSubs: [],
  subs: []
```
####`reduxSocket(socketClusterOptions, options)` - a HOC to put on your highest level real-time component.
eg `@reduxSocket({authTokenName: 'MyApp.token'}, {keepAlive: 60000})`

For example, if you use websockets for everything, stick this on the main `app`. If only certain components have websockets, stick this on those containers. 
The `socketClusterOptions` are identical to the options you'd pass in to the client socketCluster 
(http://socketcluster.io/#!/docs/api-socketcluster-client).
 
The `options` has only 1 property: `keepAlive`, which takes a value in milliseconds. 
This keeps the socket connection alive after navigating away from the component.
Say the client subs to 1000 items & accidently clicks a link that unmounts the component,
if they make it back to the component before the time expires, you won't have to start a new connection or resend
those 1000 documents. Plus, any docs that came in while they were away will be there too. Neat!

NOTES: 
 - This setup assumes you've already given the client a token (probably via HTTP). If you'd like socket-cluster to 
create a token for you, create an issue with your current workflow & together we can make a pretty API for that usecase.
 - This requires a forked verison of socketcluster-client. This dependency will revert back to the original
when v4.0 comes out.

That's it!

###TODO
- Tests! 
- Add option to create token from socket cluster



###License
MIT
