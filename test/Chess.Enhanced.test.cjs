const { expect } = require("chai");

describe("Chess Contract - Enhanced Features", function () {
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

  describe("Time Control", function () {
    it("Should support infinite time (timeControl = 0)", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      const game = await chess.getGame(gameId);
      expect(game.timeControl).to.equal(0);
      expect(game.whiteTime).to.equal(0);
      expect(game.blackTime).to.equal(0);
    });

    it("Should set initial time for both players", async function () {
      const timeControl = 600;
      const tx = await chess.connect(player1).createGame(player2.address, timeControl);
      const gameId = await getGameId(tx);
      const game = await chess.getGame(gameId);
      expect(game.whiteTime).to.equal(timeControl);
      expect(game.blackTime).to.equal(timeControl);
    });
  });

  describe("Game State Management", function () {
    it("Should prevent moves after game ends", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      await chess.connect(player1).resign(gameId);
      await expect(chess.connect(player2).makeMove(gameId, 52, 36))
        .to.be.revertedWith("Game is not active");
    });

    it("Should set correct winner on resignation", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      await chess.connect(player1).resign(gameId);
      const game = await chess.getGame(gameId);
      expect(game.state).to.equal(4);
    });
  });
});
