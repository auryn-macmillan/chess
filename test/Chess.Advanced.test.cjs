const { expect } = require("chai");

describe("Chess Contract - Advanced Tests", function () {
  let chess;
  let player1, player2, player3;

  async function getGameId(tx) {
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
    return event.args[2];
  }

  beforeEach(async function () {
    [, player1, player2, player3] = await ethers.getSigners();
    const Chess = await ethers.getContractFactory("Chess");
    chess = await Chess.deploy();
    await chess.waitForDeployment();
  });

  describe("Invalid Operations", function () {
    it("Should not allow creating game with zero address", async function () {
      await expect(chess.connect(player1).createGame(ethers.ZeroAddress, 0))
        .to.be.revertedWith("Invalid opponent address");
    });

    it("Should not allow accepting non-existent game", async function () {
      await expect(chess.connect(player2).acceptGame(0))
        .to.be.revertedWith("Only opponent can accept");
    });
  });

  describe("Multiple Games", function () {
    it("Should handle multiple games correctly", async function () {
      const tx1 = await chess.connect(player1).createGame(player2.address, 0);
      const gameId1 = await getGameId(tx1);
      const tx2 = await chess.connect(player1).createGame(player3.address, 0);
      const gameId2 = await getGameId(tx2);
      expect(gameId2).to.equal(gameId1 + 1n);
    });
  });

  describe("Events", function () {
    it("Should emit all required events", async function () {
      const tx1 = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx1);
      await expect(tx1).to.emit(chess, "GameCreated");
      await expect(chess.connect(player2).acceptGame(gameId))
        .to.emit(chess, "GameAccepted");
      await expect(chess.connect(player1).makeMove(gameId, 12, 20))
        .to.emit(chess, "MoveMade");
    });
  });
});
