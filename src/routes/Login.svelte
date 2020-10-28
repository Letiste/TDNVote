<script>
  let errors = [];

  let username = '';
  let password = '';

  function handleErrors(err) {
    err.response.data.message.forEach(({ message }) => {
      let error;
      if (message.includes('max'))
        error = 'Le n° de ticket doit être inférieur à 200';
      else if (message.includes('min'))
        error = 'Ce n° de ticket doit être supérieur à 0';
      else if (message.includes('unique'))
        error = 'Ce n° de ticket a déjà été utilisé';
      else error = message;
      errors = [...errors, error];
    });
  }

  function handleSubmit() {
    console.log(username, password);
  }
</script>

<style>
  main {
    font-family: 'Abhaya Libre';
    font-size: 2.5rem;
  }
  .titleContainer {
    background-image: linear-gradient(
      45deg,
      rgb(18, 26, 58) 0%,
      rgb(39, 9, 55) 100%
    );
    height: 30rem;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  h1 {
    font-family: 'Rye';
    font-size: 6rem;
    color: #ffde59;
    text-align: center;
  }

  .mainContainer {
    margin: -60px 30px 0;
    border-radius: 6px;
    box-shadow: 0 16px 24px 2px rgba(0, 0, 0, 0.14),
      0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.2);
    background-color: #fff;
    background-size: contain;
    margin-bottom: 50px;
    padding-bottom: 50px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: content-box;
  }

  h2 {
    font-family: 'Rye';
    font-size: 3rem;
    padding-top: 40px;
    text-align: center;
  }

  .errors li {
    color: rgb(200, 0, 0);
    list-style: none;
    font-size: 1.5rem;
    font-weight: bold;
  }

  form {
    font-family: 'Abhaya Libre';
    display: flex;
    flex-direction: column;
    padding: 50px;
    font-size: 2rem;
    border-top: 2px solid rgba(39, 9, 55, 0.5);
  }

  label {
    align-self: center;
  }

  select {
    font-size: 2rem;
    margin: 15px;
    border: 2px solid rgb(39, 9, 55);
    border-radius: 10px;
    padding: 5px;
    background-color: #fff;
    font-family: 'Abhaya Libre';
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    cursor: pointer;
  }

  .ticket {
    display: flex;
    flex-wrap: nowrap;
  }

  input {
    font-size: 2rem;
    margin: 15px;
    border: 2px solid rgb(39, 9, 55);
    border-radius: 10px;
    padding: 5px;
    font-family: 'Abhaya Libre';
    transition: all 250ms;
  }

  input:hover,
  input:focus,
  select:hover,
  select:focus {
    border-color: #ffde59;
    border-radius: 10px;
  }

  button {
    border: 2px solid rgb(39, 9, 55);
    border-radius: 10px;
    padding: 10px;
    font-size: 2.5rem;
    margin-top: 20px;
    font-family: 'Abhaya Libre';
    font-weight: bold;
    background-color: rgb(39, 9, 55);
    color: #ffde59;
    cursor: pointer;
  }
</style>

<main>
  <div class="titleContainer">
    <h1>Talents du Nord</h1>
  </div>

  <div class="mainContainer">
    <h2>Login</h2>

    <div class="errors">
      <ul>
        {#each errors as error}
          <li>{error}</li>
        {/each}
      </ul>
    </div>

    <form on:submit|preventDefault={handleSubmit}>
      <label for="username">Username</label>
      <input type="text" id="username" bind:value={username} required />

      <label for="password">Password</label>
      <input type="password" id="password" bind:value={password} required />

      <button type="submit">Login</button>
    </form>
  </div>
</main>
