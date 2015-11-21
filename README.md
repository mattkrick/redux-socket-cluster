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
isAuthenticating: false, //doesn't exist in socket-cluster, but could be useful for routing purposes
error: null,
token: null,
pendingSubs: [], //needs a PR from socketcluster to use automatically. for now, you must emit a `subscribeRequest`
subs: []
```
####`reduxSocket(options)` - a HOC to put on your highest level real-time component.
eg `@reduxSocket({authTokenName: 'MyApp.token'})`

For example, if you use websockets for everything, stick this on the main `app`. If only certain components have websockets, stick this on those containers. 
The options are identical to the options you'd pass in to the client socketCluster 
(http://socketcluster.io/#!/docs/api-socketcluster-client) except for one additional option: `authLocalToken` (default: `true`)
If you set this to false, then socketCluster will ignore your JWT. This is only useful if you have multiple JWTs for different
parts of your site. Since this is an edge case, the default is true so most folks don't have to worry about it.

NOTE: This setup assumes you've already given the client a token (probably via HTTP). If you'd like socket-cluster to 
create a token for you, create an issue with your current workflow & together we can make a pretty API for that usecase.

That's it!

###TODO
- Tests!
- Add option to create token from socket cluster



###License
MIT
