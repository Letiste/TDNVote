<script>
  import { onMount } from 'svelte';

  import ArtistService from '../services/ArtistService';
  import SpectatorService from '../services/SpectatorService';

  let nbVotes = 0;

  let showArtists = true;
  let showSpectators = true;

  let artists = [];
  let spectators = [];

  let cumulatedVotes = [];
  let votesTicketNumbers = [];

  function getCumulatedVotes(voters) {
    voters.forEach(({ vote }) => {
      if (votesTicketNumbers.indexOf(vote) === -1) {
        votesTicketNumbers.push(vote);
        cumulatedVotes = [...cumulatedVotes, { ticketNumber: vote, nbVote: 1 }];
      } else {
        let artist = cumulatedVotes.find(
          (votes) => votes.ticketNumber === vote
        );
        artist.nbVote++;
      }
    });
  }
  onMount(async () => {
    const resArtists = await ArtistService.get();
    artists = resArtists.data;
    const resSpectators = await SpectatorService.get();
    spectators = resSpectators.data;

    getCumulatedVotes(artists);
    getCumulatedVotes(spectators);
    cumulatedVotes.sort((artistX, artistY) => {
      return artistY.nbVote - artistX.nbVote;
    });

    nbVotes = artists.length + spectators.length;
  });

  function handleDestroy() {
    if (confirm('Voulez-vous supprimer tous les votes ?')) {
      ArtistService.destroy().then(() => (artists = []));
      SpectatorService.destroy().then(() => (spectators = []));
      nbVotes = 0;
      cumulatedVotes = [];
      votesTicketNumbers = [];
    } else {
      return;
    }
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

  .details {
    display: flex;
  }

  .details p {
    margin-left: 15px;
  }

  .destroyVotes {
    border: 4px solid rgb(200, 0, 0);
    border-radius: 10px;
    background-color: transparent;
    color: rgb(200, 0, 0);
    font-size: 1.7rem;
    line-height: 0;
    font-weight: bold;
    padding: 10px;
    width: 190px;
    height: 50px;
    margin-right: 15px;
    cursor: pointer;
    transition: all 300ms;
  }

  .destroyVotes:hover {
    background-color: rgb(200, 0, 0);
    color: #fff;
  }

  .votesBar {
    display: inline-block;
    margin-left: 20px;
    margin-right: 20px;
    height: 1.5rem;
  }

  .filterCategories {
    display: flex;
  }

  button {
    width: 2rem;
    height: 2rem;
    align-self: center;
    margin-left: 15px;
    border-radius: 5px;
  }

  h3 {
    border-bottom: 2px solid rgba(39, 9, 55, 0.5);
    width: 50%;
    text-align: center;
  }

  .tableWrapper {
    height: 800px;
    overflow: auto;
    width: 500px;
  }
  tr,
  td {
    border: 2px solid rgb(39, 9, 55);
    padding: 20px;
  }
</style>

<main>
  <div class="titleContainer">
    <h1>Talents du Nord</h1>
  </div>

  <div class="mainContainer">
    <h2>Administration</h2>
    <div class="details">
      <button class="destroyVotes" on:click={handleDestroy}>Reset votes</button>
      <p>Nombre de votes : <strong>{nbVotes}</strong></p>
    </div>

    <div>
      {#each cumulatedVotes as { ticketNumber, nbVote }}
        <p>
          {ticketNumber},
          <span
            class="votesBar"
            style="width:{(nbVote * 300) / nbVotes}px; background-color:hsl({(nbVote * 360) / nbVotes}, 90%, 50%)" />{nbVote}
        </p>
      {/each}
    </div>

    <div class="filterCategories">
      <label for="artists">Artistes</label>
      <button
        type="checkbox"
        style="margin-right: 30px; background-color: {showArtists ? '#ffde59' : 'rgb(39,9,55)'}"
        on:click={() => (showArtists = !showArtists)} />

      <label for="spectators" style="margin-left: 30px">Spectateurs</label>
      <button
        style="background-color: {showSpectators ? '#ffde59' : 'rgb(39,9,55)'}"
        type="checkbox"
        on:click={() => (showSpectators = !showSpectators)} />
    </div>

    <h3>Votes</h3>

    <div class="tableWrapper">
      <table>
        <tbody>
          {#if showArtists}
            {#each artists as artist}
              <tr>
                <td>N° de ticket: {artist.ticketNumber}</td>
                <td>Vote: {artist.vote}</td>
              </tr>
            {/each}
          {/if}
          {#if showSpectators}
            {#each spectators as spectator}
              <tr>
                <td>N° de ticket: {spectator.ticketNumber}</td>
                <td>Vote: {spectator.vote}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</main>
