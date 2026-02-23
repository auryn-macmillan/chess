const { expect } = require("chai");

describe("Chess Contract - New Features", function () {
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

  describe("Game Cancellation", function () {
    it("Should allow creator to cancel pending game", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await expect(chess.connect(player1).cancelGame(gameId))
        .to.emit(chess, "GameCancelled");
      const game = await chess.getGame(gameId);
      expect(game.state).to.equal(6);
    });

    it("Should NOT allow opponent to cancel game", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await expect(chess.connect(player2).cancelGame(gameId))
        .to.be.revertedWith("Only creator can cancel");
    });

    it("Should NOT allow cancelling active game", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      await expect(chess.connect(player1).cancelGame(gameId))
        .to.be.revertedWith("Can only cancel pending games");
    });
  });

  describe("Draw Offer/Accept Mechanism", function () {
    async function createAndAcceptGame() {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      return gameId;
    }

    it("Should emit DrawOffered event", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player1).offerDraw(gameId))
        .to.emit(chess, "DrawOffered");
    });

    it("Should NOT allow accepting own draw offer", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).offerDraw(gameId);
      await expect(chess.connect(player1).acceptDraw(gameId))
        .to.be.revertedWith("Cannot accept own draw offer");
    });

    it("Should allow declining draw offer", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).offerDraw(gameId);
      await expect(chess.connect(player2).declineDraw(gameId))
        .to.emit(chess, "DrawDeclined");
    });

    it("Should allow offerer to withdraw their draw offer", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).offerDraw(gameId);
      await expect(chess.connect(player1).withdrawDrawOffer(gameId))
        .to.emit(chess, "DrawOfferWithdrawn");
    });
  });

  describe("50-Move Rule", function () {
    it("Should create game with 50-move rule disabled by default", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      const game = await chess.getGame(gameId);
      expect(game._maxHalfMovesWithoutCapture).to.equal(0);
    });

    it("Should create game with custom 50-move rule", async function () {
      const tx = await chess.connect(player1)["createGame(address,uint256,uint256)"](player2.address, 0, 100);
      const gameId = await getGameId(tx);
      const game = await chess.getGame(gameId);
      expect(game._maxHalfMovesWithoutCapture).to.equal(100);
    });
  });

  describe("Threefold Repetition", function () {
    async function createGame() {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      return gameId;
    }

    it("Should detect threefold repetition", async function () {
      const gameId = await createGame();
      await chess.connect(player1).makeMove(gameId, 1, 18);
      await chess.connect(player2).makeMove(gameId, 57, 40);
      await chess.connect(player1).makeMove(gameId, 18, 1);
      await chess.connect(player2).makeMove(gameId, 40, 57);
      await chess.connect(player1).makeMove(gameId, 1, 18);
      await chess.connect(player2).makeMove(gameId, 57, 40);
      await chess.connect(player1).makeMove(gameId, 18, 1);
      await chess.connect(player2).makeMove(gameId, 40, 57);
      const game = await chess.getGame(gameId);
      expect(game.state).to.equal(2);
    });
  });
});
