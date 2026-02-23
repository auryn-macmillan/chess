const { expect } = require("chai");

describe("Chess Contract - Security Tests", function () {
  let chess;
  let player1, player2, player3;

  async function getGameId(tx) {
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
    return event.args[2];
  }

  async function createAndAcceptGame() {
    const tx = await chess.connect(player1).createGame(player2.address, 0);
    const gameId = await getGameId(tx);
    await chess.connect(player2).acceptGame(gameId);
    return gameId;
  }

  beforeEach(async function () {
    [, player1, player2, player3] = await ethers.getSigners();
    const Chess = await ethers.getContractFactory("Chess");
    chess = await Chess.deploy();
    await chess.waitForDeployment();
  });

  describe("Resignation Security", function () {
    it("Should NOT allow non-player to resign", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player3).resign(gameId))
        .to.be.revertedWith("Not a player in this game");
    });

    it("Should NOT allow resigning from already ended game", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).resign(gameId);
      await expect(chess.connect(player2).resign(gameId))
        .to.be.revertedWith("Game is already ended");
    });
  });

  describe("Self-Play Prevention", function () {
    it("Should NOT allow creating game against yourself", async function () {
      await expect(chess.connect(player1).createGame(player1.address, 0))
        .to.be.revertedWith("Cannot play against yourself");
    });
  });

  describe("Draw Security", function () {
    it("Should NOT allow non-player to offer draw", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player3).offerDraw(gameId))
        .to.be.revertedWith("Not a player in this game");
    });

    it("Should NOT allow draw on pending game", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await expect(chess.connect(player1).offerDraw(gameId))
        .to.be.revertedWith("Game is not active");
    });
  });

  describe("Move Security", function () {
    it("Should NOT allow non-player to make move", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player3).makeMove(gameId, 12, 28))
        .to.be.revertedWith("Not a player in this game");
    });

    it("Should NOT allow moving opponent's piece", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player1).makeMove(gameId, 48, 40))
        .to.be.revertedWith("Not your piece");
    });
  });
});
