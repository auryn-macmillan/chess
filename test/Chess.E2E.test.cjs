const { expect } = require("chai");

describe("Chess Contract - End-to-End Game Lifecycle", function () {
  let chess;
  let player1, player2;

  async function getGameId(tx) {
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
    return event.args[2];
  }

  beforeEach(async function () {
    [, player1, player2] = await ethers.getSigners();
    const Chess = await ethers.getContractFactory("Chess");
    chess = await Chess.deploy();
    await chess.waitForDeployment();
  });

  it("Should simulate a complete game from creation to resignation", async function () {
    const tx = await chess.connect(player1).createGame(player2.address, 0);
    const gameId = await getGameId(tx);
    await chess.connect(player2).acceptGame(gameId);
    await chess.connect(player1).makeMove(gameId, 12, 28);
    await chess.connect(player2).makeMove(gameId, 52, 36);
    await chess.connect(player1).resign(gameId);
    const game = await chess.getGame(gameId);
    expect(game.state).to.equal(4);
  });

  it("Should simulate a draw offer and acceptance", async function () {
    const tx = await chess.connect(player1).createGame(player2.address, 0);
    const gameId = await getGameId(tx);
    await chess.connect(player2).acceptGame(gameId);
    await chess.connect(player1).offerDraw(gameId);
    await chess.connect(player2).acceptDraw(gameId);
    const game = await chess.getGame(gameId);
    expect(game.state).to.equal(2);
  });

  it("Should support different time controls for different games", async function () {
    const tx1 = await chess.connect(player1).createGame(player2.address, 300);
    const tx2 = await chess.connect(player1).createGame(player2.address, 600);
    const gameId1 = await getGameId(tx1);
    const gameId2 = await getGameId(tx2);
    const game1 = await chess.getGame(gameId1);
    const game2 = await chess.getGame(gameId2);
    expect(game1.timeControl).to.equal(300);
    expect(game2.timeControl).to.equal(600);
  });
});
