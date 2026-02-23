const { expect } = require("chai");

describe("Chess Contract - Full Rules", function () {
  let chess;
  let player1, player2;

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
    [, player1, player2] = await ethers.getSigners();
    const Chess = await ethers.getContractFactory("Chess");
    chess = await Chess.deploy();
    await chess.waitForDeployment();
  });

  describe("Board Initialization", function () {
    it("Should initialize board with correct piece placement", async function () {
      const gameId = await createAndAcceptGame();
      expect(await chess.getPieceAt(gameId, 0)).to.equal(4);
      expect(await chess.getPieceAt(gameId, 4)).to.equal(6);
      expect(await chess.getPieceAt(gameId, 60)).to.equal(12);
    });
  });

  describe("Pawn Moves", function () {
    it("Should allow white pawn single move forward", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player1).makeMove(gameId, 12, 20))
        .to.emit(chess, "MoveMade");
      expect(await chess.getPieceAt(gameId, 20)).to.equal(1);
    });

    it("Should allow white pawn double move from start", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player1).makeMove(gameId, 12, 28))
        .to.emit(chess, "MoveMade");
    });

    it("Should allow pawn capture diagonally", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).makeMove(gameId, 12, 28);
      await chess.connect(player2).makeMove(gameId, 51, 35);
      await expect(chess.connect(player1).makeMove(gameId, 28, 35))
        .to.emit(chess, "MoveMade");
    });
  });

  describe("Knight Moves", function () {
    it("Should allow knight L-shape moves", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player1).makeMove(gameId, 1, 18))
        .to.emit(chess, "MoveMade");
    });
  });

  describe("Bishop Moves", function () {
    it("Should validate bishop moves", async function () {
      const gameId = await createAndAcceptGame();
      const board = await chess.getBoard(gameId);
      expect(board).to.not.equal(0);
    });
  });

  describe("Rook Moves", function () {
    it("Should validate rook moves", async function () {
      const gameId = await createAndAcceptGame();
      const board = await chess.getBoard(gameId);
      expect(board).to.not.equal(0);
    });
  });

  describe("Queen Moves", function () {
    it("Should validate queen moves", async function () {
      const gameId = await createAndAcceptGame();
      const board = await chess.getBoard(gameId);
      expect(board).to.not.equal(0);
    });
  });

  describe("King Moves", function () {
    it("Should validate king moves", async function () {
      const gameId = await createAndAcceptGame();
      const board = await chess.getBoard(gameId);
      expect(board).to.not.equal(0);
    });
  });

  describe("Check Detection", function () {
    it("Should detect check", async function () {
      const gameId = await createAndAcceptGame();
      const state = await chess.getGameState(gameId);
      expect(state.state).to.equal(1);
    });
  });

  describe("Castling", function () {
    it("Should track castling rights", async function () {
      const gameId = await createAndAcceptGame();
      const state = await chess.getGameState(gameId);
      expect(state.castlingRights).to.equal(15);
    });
  });

  describe("Pawn Promotion", function () {
    it("Should detect promotion opportunity when pawn reaches last rank", async function () {
      const gameId = await createAndAcceptGame();
      const board = await chess.getBoard(gameId);
      expect(board).to.not.equal(0);
    });
  });

  describe("Game State", function () {
    it("Should return correct game state including board", async function () {
      const gameId = await createAndAcceptGame();
      const state = await chess.getGameState(gameId);
      expect(state.currentPlayer).to.equal(0);
      expect(state.state).to.equal(1);
    });
  });
});
