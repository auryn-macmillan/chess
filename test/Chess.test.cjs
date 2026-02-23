const { expect } = require("chai");

describe("Chess Contract", function () {
  let chess;
  let owner, player1, player2;

  async function getGameId(tx) {
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
    return event.args[2];
  }

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();
    const Chess = await ethers.getContractFactory("Chess");
    chess = await Chess.deploy();
    await chess.waitForDeployment();
  });

  describe("Game Creation", function () {
    it("Should create a new game with infinite time", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      const game = await chess.getGame(gameId);
      expect(game.creator).to.equal(player1.address);
      expect(game.opponent).to.equal(player2.address);
      expect(game.state).to.equal(0);
    });

    it("Should emit GameCreated event with time control", async function () {
      await expect(chess.connect(player1).createGame(player2.address, 600))
        .to.emit(chess, "GameCreated")
        .withArgs(player1.address, player2.address, 0, 600, 0);
    });
  });

  describe("Game Acceptance", function () {
    it("Should allow opponent to accept game", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await expect(chess.connect(player2).acceptGame(gameId))
        .to.emit(chess, "GameAccepted");
      const game = await chess.getGame(gameId);
      expect(game.state).to.equal(1);
    });
  });

  describe("Game Moves", function () {
    it("Should allow valid moves", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      await expect(chess.connect(player1).makeMove(gameId, 12, 28))
        .to.emit(chess, "MoveMade");
    });
  });

  describe("Game Resignation", function () {
    it("Should allow creator to resign", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      await expect(chess.connect(player1).resign(gameId))
        .to.emit(chess, "GameEnded");
      const game = await chess.getGame(gameId);
      expect(game.state).to.equal(4);
    });
  });

  describe("Draw Functionality", function () {
    it("Should allow player to offer and accept draw", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      await expect(chess.connect(player1).offerDraw(gameId))
        .to.emit(chess, "DrawOffered");
      await expect(chess.connect(player2).acceptDraw(gameId))
        .to.emit(chess, "GameEnded");
      const game = await chess.getGame(gameId);
      expect(game.state).to.equal(2);
    });
  });
});
