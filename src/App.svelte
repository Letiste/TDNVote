<script>
  import { Router, Route } from 'svelte-routing';
  import Admin from './routes/Admin.svelte';
  import Home from './routes/Home.svelte';
  import Login from './routes/Login.svelte';

  export let url = '';
</script>

<Router {url}>
  <div>
    <Route path="login" component={Login} />
    <Route path="admin" component={Admin} />
    <Route path="/" component={Home} />
  </div>
</Router>
