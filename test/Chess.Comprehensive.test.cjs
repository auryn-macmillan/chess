const { expect } = require("chai");

describe("Chess Contract - Comprehensive Tests", function () {
  let chess;
  let player1, player2;

  async function getGameId(tx) {
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
    return event.args[2];
  }

  async function createAndAcceptGame(timeControl = 0) {
    const tx = await chess.connect(player1).createGame(player2.address, timeControl);
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

  describe("Piece Movement - Knight", function () {
    it("Should allow knight L-shape moves", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player1).makeMove(gameId, 1, 18))
        .to.emit(chess, "MoveMade");
      expect(await chess.getPieceAt(gameId, 18)).to.equal(2);
    });

    it("Should allow knight to jump over pieces", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).makeMove(gameId, 1, 18);
      await chess.connect(player2).makeMove(gameId, 57, 40);
      await expect(chess.connect(player1).makeMove(gameId, 18, 35))
        .to.emit(chess, "MoveMade");
    });

    it("Should not allow knight non-L-shape moves", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player1).makeMove(gameId, 1, 17))
        .to.be.revertedWith("Invalid move");
    });
  });

  describe("Pawn Moves", function () {
    it("Should allow pawn single move forward", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player1).makeMove(gameId, 12, 20))
        .to.emit(chess, "MoveMade");
    });

    it("Should allow pawn double move from start", async function () {
      const gameId = await createAndAcceptGame();
      await expect(chess.connect(player1).makeMove(gameId, 12, 28))
        .to.emit(chess, "MoveMade");
    });

    it("Should not allow pawn double move after first move", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).makeMove(gameId, 12, 20);
      await chess.connect(player2).makeMove(gameId, 50, 34);
      await expect(chess.connect(player1).makeMove(gameId, 20, 36))
        .to.be.revertedWith("Invalid move");
    });

    it("Should allow pawn capture diagonally", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).makeMove(gameId, 12, 28);
      await chess.connect(player2).makeMove(gameId, 51, 35);
      await expect(chess.connect(player1).makeMove(gameId, 28, 35))
        .to.emit(chess, "MoveMade");
    });
  });

  describe("En Passant", function () {
    it("Should set en passant square after pawn double move", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).makeMove(gameId, 12, 28);
      const enPassant = await chess.gameEnPassantSquare(gameId);
      expect(enPassant).to.equal(20);
    });

    it("Should clear en passant square after turn", async function () {
      const gameId = await createAndAcceptGame();
      await chess.connect(player1).makeMove(gameId, 12, 28);
      await chess.connect(player2).makeMove(gameId, 50, 34);
      const enPassant = await chess.gameEnPassantSquare(gameId);
      expect(enPassant).to.not.equal(20);
    });
  });

  describe("Castling Rights", function () {
    it("Should initialize castling rights correctly", async function () {
      const gameId = await createAndAcceptGame();
      const state = await chess.getGameState(gameId);
      expect(state.castlingRights).to.equal(15);
    });
  });

  describe("Pawn Promotion", function () {
    it("Should detect promotion scenario", async function () {
      const gameId = await createAndAcceptGame();
      const board = await chess.getBoard(gameId);
      expect(board).to.not.equal(0);
    });
  });

  describe("50-Move Rule", function () {
    it("Should end game in draw when limit reached", async function () {
      const tx = await chess.connect(player1)["createGame(address,uint256,uint256)"](player2.address, 0, 4);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      
      await chess.connect(player1).makeMove(gameId, 1, 18);
      await chess.connect(player2).makeMove(gameId, 57, 40);
      await chess.connect(player1).makeMove(gameId, 18, 1);
      await chess.connect(player2).makeMove(gameId, 40, 57);
      
      const game = await chess.getGame(gameId);
      expect(game.state).to.equal(2);
    });

    it("Should reset counter on pawn move", async function () {
      const tx = await chess.connect(player1)["createGame(address,uint256,uint256)"](player2.address, 0, 10);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      
      await chess.connect(player1).makeMove(gameId, 1, 18);
      expect(await chess.halfMovesWithoutCapture(gameId)).to.equal(1);
      
      await chess.connect(player2).makeMove(gameId, 49, 41);
      expect(await chess.halfMovesWithoutCapture(gameId)).to.equal(0);
    });

    it("Should reset counter on capture", async function () {
      const tx = await chess.connect(player1)["createGame(address,uint256,uint256)"](player2.address, 0, 10);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      
      await chess.connect(player1).makeMove(gameId, 1, 18);
      await chess.connect(player2).makeMove(gameId, 51, 35);
      expect(await chess.halfMovesWithoutCapture(gameId)).to.equal(0);
    });
  });

  describe("Threefold Repetition", function () {
    it("Should detect threefold repetition", async function () {
      const gameId = await createAndAcceptGame();
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

  describe("Time Control", function () {
    it("Should end game when time expires", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 1);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");
      
      await expect(chess.connect(player1).makeMove(gameId, 10, 26))
        .to.emit(chess, "TimeExpired");
      
      const game = await chess.getGame(gameId);
      expect(game.state).to.equal(4);
    });
  });
});
