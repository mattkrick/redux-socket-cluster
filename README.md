# redux-socket-cluster
A socket-cluster state snatcher

###WIP - Thoughts & PRs welcome!

Socket cluster is awesome, but it doesn't share it's state, so you always have to go to your stored socket to find out. 
This tiny package grabs all the tasty little state bits & sticks em in your redux store. 
Then, it sets up listeners for updates to keep those state bits nice and fresh.
This makes it super easy to do things like "Please wait, reconnecting" modals without having to access the socket.
More complex examples might be getting kicked off a subscription & pushing a 
"You got booted from the chat room. Sending you to the lobby..."

###Installation

`npm i -S redux-socket-cluster`
install the custom socketcluster-client (only until v4): `git://github.com/mattkrick/socketcluster-client.git#master` 
Require `babel-polyfill` in your project somewhere. (`babel-runtime` isn't working right now)
Store your socket instance in a file. For example, in a `utils/socket.js` you might have
`export default socketCluster.connect(socketOptions)`
Then, you can import that socket connection in any client-side file.

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
####`reduxSocket(socket, options)` - a HOC to put on your highest level real-time component.
eg `@reduxSocket(socket, {keepAlive: 5000})`

For example, if you use websockets for everything, stick this on the main `app`. 
If only certain components have websockets, stick this on those containers. 
 
The `options` has only 1 property: `keepAlive`, which takes a value in milliseconds. 
This keeps the socket connection alive after navigating away from the component.
Say the client subs to 1000 items & accidentally clicks a link that unmounts the component,
if they make it back to the component before the time expires, you won't have to start a new connection or resend
those 1000 documents. Plus, any docs that came in while they were away will be there too. Nice!

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
