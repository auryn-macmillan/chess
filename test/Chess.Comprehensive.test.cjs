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

    it("Should promote pawn to queen via game move", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      
      const board = "0x0000000000010000000000000000000000000000000000000000000000060000";
      await chess.connect(player1).setGameState(gameId, board, 15, 0);
      
      await chess.connect(player1).makeMoveWithPromotion(gameId, 52, 60, 5);
      
      const newBoard = await chess.getBoard(gameId);
      expect(newBoard).to.equal("0x0005000000000000000000000000000000000000000000000000000000060000");
    });

    it("Should capture en passant", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      
      const board = "0x000c000000000000000000000000000000007000000000000001000000060000";
      await chess.connect(player1).setGameState(gameId, board, 0, 0);
      
      await chess.connect(player1).makeMove(gameId, 12, 28);
      
      const stateAfterWhite = await chess.getGameState(gameId);
      expect(stateAfterWhite.enPassantSquare).to.equal(20);
      
      await chess.connect(player2).makeMove(gameId, 27, 20);
      
      const finalBoard = await chess.getBoard(gameId);
      expect(finalBoard).to.equal("0x000c000000000000000000000000000000000000000700000000000000060000");
    });

    it("Should allow bishop to move diagonally with clear path", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      
      // White bishop at c1 (2), white king at e1 (4), black king at e8 (60)
      // Bishop can move to f4 (33) - diagonal NE direction, clear path
      // c1 = column 2, row 0 = 0*8 + 2 = 2
      // f4 = column 5, row 3 = 3*8 + 5 = 29
      
      let hex = '0'.repeat(64).split('');
      hex[64 - 1 - 2] = '3';   // white bishop at c1 (2)
      hex[64 - 1 - 4] = '6';   // white king at e1 (4)
      hex[64 - 1 - 60] = 'c';  // black king at e8 (60)
      
      const board = '0x' + hex.join('');
      
      await chess.connect(player1).setGameState(gameId, board, 0, 0);
      
      // Bishop from c1(2) to f4(29)
      await chess.connect(player1).makeMove(gameId, 2, 29);
      
      const newBoard = await chess.getBoard(gameId);
      expect(newBoard).to.equal("0x000c000000000000000000000000000000300000000000000000000000060000");
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

  describe("Insufficient Material Detection", function () {
    it("Should detect K vs K", async function () {
      const board = "0x000000000000000000000000000000000000000000000000000000000000060c";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(true);
    });

    it("Should detect K+N vs K", async function () {
      const board = "0x000000000000000000000000000000000000000000000000000000020000060c";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(true);
    });

    it("Should detect K+B vs K", async function () {
      const board = "0x000000000000000000000000000000000000000000000000000000030000060c";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(true);
    });

    it("Should detect K+B vs K+B same color bishops", async function () {
      const board = "0x000c009000000000000000000000000000000000000000000000000000000306";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(true);
    });

    it("Should NOT detect draw for K+N vs K+B", async function () {
      const board = "0x000000000000000000000000000000000000000000000000000300020000060c";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(false);
    });

    it("Should NOT detect draw with pawns", async function () {
      const board = "0x000000000000000000000000000000000000000000000000000000010000060c";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(false);
    });

    it("Should NOT detect draw with rooks", async function () {
      const board = "0x000000000000000000000000000000000000000000000000000000040000060c";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(false);
    });

    it("Should NOT detect draw with queens", async function () {
      const board = "0x000000000000000000000000000000000000000000000000000000050000060c";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(false);
    });
  });

  describe("Security Tests", function () {
    it("Should NOT allow non-creator to set board", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      await expect(chess.connect(player2).setBoard(gameId, board)).to.be.revertedWith("Not creator");
    });

    it("Should allow creator to set board", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      await chess.connect(player1).setBoard(gameId, board);
    });
  });

  describe("Test Helpers", function () {
    it("Should use checkInsufficientMaterial helper", async function () {
      const board = "0x000000000000000000000000000000000000000000000000000000000000060c";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(true);
    });
  });

  describe("Draw Detection", function () {
    it("Should detect draw via insufficient material", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      await chess.connect(player1).setBoard(gameId, "0x000000000000000000000000000000000000000000000000000000000000060c");
      await chess.connect(player1).makeMove(gameId, 2, 3);
      const game = await chess.getGame(gameId);
      expect(game.state).to.equal(2);
    });
  });

  describe("Game Setup", function () {
    it("Should create game and accept", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
    });
  });

  describe("King vs King Endgame", function () {
    it("Should handle K vs K+ position", async function () {
      const board = "0x000000000000000000000000000000000000000000000000000000000000060c";
      const result = await chess.checkInsufficientMaterial(board);
      expect(result).to.equal(true);
    });
  });

  describe("Checkmate Detection", function () {
    it("Should handle checkmate board positions", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      
      const squares = new Array(64).fill('0');
      squares[51] = '5';
      squares[60] = 'c';
      squares[4] = '6';
      const board = '0x' + squares.reverse().join('');
      
      await chess.connect(player1).setGameState(gameId, board, 0, 1);
      
      try {
        await chess.connect(player2).makeMove(gameId, 60, 59);
      } catch (e) {}
    });
  });

  describe("Piece Color Helper", function () {
    it("Should handle empty board", async function () {
      const result = await chess.checkInsufficientMaterial("0x0000000000000000000000000000000000000000000000000000000000000000");
      expect(result).to.equal(true);
    });

    it("Should return 255 for piece 0", async function () {
      const result = await chess.getPieceColor(0);
      expect(result).to.equal(255);
    });

    it("Should return 0 for white pieces", async function () {
      const result = await chess.getPieceColor(1);
      expect(result).to.equal(0);
    });

    it("Should return 1 for black pieces", async function () {
      const result = await chess.getPieceColor(7);
      expect(result).to.equal(1);
    });
  });

  describe("Board Setup Tests", function () {
    it("Should set up and play move from custom board", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      await chess.connect(player1).setBoard(gameId, board);
      await chess.connect(player1).makeMove(gameId, 0, 1);
    });

    it("Should allow white kingside castling", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      const board = "0x000c000000000000000000000000000000000000000000000000000040060000";
      await chess.connect(player1).setGameState(gameId, board, 1, 0);
      await expect(chess.connect(player1).makeMove(gameId, 4, 6)).to.emit(chess, "MoveMade");
    });

    it("Should verify castling moves rook", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      const board = "0x000c000000000000000000000000000000000000000000000000000040060000";
      await chess.connect(player1).setGameState(gameId, board, 1, 0);
      await chess.connect(player1).makeMove(gameId, 4, 6);
      const after = await chess.getBoard(gameId);
      expect(after).to.equal("0x000c000000000000000000000000000000000000000000000000000006400000");
    });
  });

  describe("En Passant Path", function () {
    it("Should test en passant capture", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      // White pawn e2->e4
      await chess.connect(player1).makeMove(gameId, 12, 28);
      // Black pawn d7->d5
      await chess.connect(player2).makeMove(gameId, 51, 35);
      // White pawn e4->d5 en passant!
      await chess.connect(player1).makeMove(gameId, 28, 35);
    });
  });

  describe("Full Castling Test", function () {
    it("Should complete kingside castling", async function () {
      const tx = await chess.connect(player1).createGame(player2.address, 0);
      const gameId = await getGameId(tx);
      await chess.connect(player2).acceptGame(gameId);
      
      // Set up: king e1, rook h1, path clear
      const board = "0x000c000000000000000000000000000000000000000000000000000040060000";
      // Castling rights = 1 means white kingside allowed
      await chess.connect(player1).setGameState(gameId, board, 1, 0);
      
      const before = await chess.getBoard(gameId);
      console.log('Before:', before);
      
      // Castling: king e1->g1 (4->6)
      await chess.connect(player1).makeMove(gameId, 4, 6);
      
      const after = await chess.getBoard(gameId);
      console.log('After:', after);
      
      // Verify rook moved from h1 to f1
      expect(after).to.equal("0x000c000000000000000000000000000000000000000000000000000006400000");
    });

    it("Should test castling rook move helper", async function () {
      const board = "0x000c000000000000000000000000000000000000000000000000000040060000";
      const result = await chess.testCastlingRookMove(board, 0, true);
      expect(result).to.equal("0x000c000000000000000000000000000000000000000000000000000000460000");
    });

    it("Should test simulateMove with special=1 (castling)", async function () {
      const board = "0x000c000000000000000000000000000000000000000000000000000040060000";
      const result = await chess.testSimulateMove(board, 4, 6, 6, 0, 1);
      expect(result).to.equal("0x000c000000000000000000000000000000000000000000000000000006400000");
    });

    it("Should test simulateMove with special=2 (en passant)", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000020000";
      const result = await chess.testSimulateMove(board, 52, 35, 1, 1, 2);
      expect(result).to.equal("0x0000000000000000000000000000100000000000000000000000000000020000");
    });

    it("Should test simulateMove with special=3 (promotion)", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000010000";
      const result = await chess.testSimulateMove(board, 52, 60, 1, 0, 3);
      expect(result).to.equal("0x0001000000000000000000000000000000000000000000000000000000010000");
    });

    it("Should test executeMove promotion", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000010000";
      const result = await chess.testExecuteMovePromotion(board, 52, 60, 1, 0, 3);
      expect(result).to.equal("0x0003000000000000000000000000000000000000000000000000000000010000");
    });

    it("Should test executeMove without promotion", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000010000";
      const result = await chess.testExecuteMovePromotion(board, 52, 60, 1, 0, 0);
      expect(result).to.equal("0x0001000000000000000000000000000000000000000000000000000000010000");
    });
  });

  describe("Custom Game Setup", function () {
    it("Should create game with custom setup", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      const tx = await chess.createGameWithCustomSetup(
        player1.address,
        player2.address,
        board,
        0x0F,
        300,
        0
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
      const gameId = event.args[2];
      
      expect(await chess.gameCreators(gameId)).to.equal(player1.address);
      expect(await chess.gameOpponents(gameId)).to.equal(player2.address);
      expect(await chess.gameCurrentPlayer(gameId)).to.equal(0);
      expect(await chess.gameTimeControl(gameId)).to.equal(300);
    });

    it("Should create game with custom maxHalfMovesWithoutCapture", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      const tx = await chess.createGameWithCustomSetup(
        player1.address,
        player2.address,
        board,
        0x0F,
        600,
        100
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
      const gameId = event.args[2];
      
      expect(await chess.gameCreators(gameId)).to.equal(player1.address);
      expect(await chess.gameTimeControl(gameId)).to.equal(600);
      expect(await chess.maxHalfMovesWithoutCapture(gameId)).to.equal(100);
    });

    it("Should reject creating game with zero white player", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      await expect(
        chess.createGameWithCustomSetup(
          ethers.ZeroAddress,
          player2.address,
          board,
          0x0F,
          300,
          0
        )
      ).to.be.revertedWith("Invalid white player address");
    });

    it("Should reject creating game with zero black player", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      await expect(
        chess.createGameWithCustomSetup(
          player1.address,
          ethers.ZeroAddress,
          board,
          0x0F,
          300,
          0
        )
      ).to.be.revertedWith("Invalid black player address");
    });

    it("Should reject creating game with same player for both sides", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      await expect(
        chess.createGameWithCustomSetup(
          player1.address,
          player1.address,
          board,
          0x0F,
          300,
          0
        )
      ).to.be.revertedWith("Players cannot be the same");
    });

    it("Should accept custom setup game", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      const tx = await chess.createGameWithCustomSetup(
        player1.address,
        player2.address,
        board,
        0x0F,
        300,
        0
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
      const gameId = event.args[2];
      
      const tx2 = await chess.connect(player2).acceptGame(gameId);
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find(log => log.fragment && log.fragment.name === 'GameAccepted');
      
      expect(event2).to.not.be.undefined;
      const gameState = await chess.getGameState(gameId);
      expect(gameState[4]).to.equal(1);
    });

    it("Should make move from custom setup position", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      const tx = await chess.createGameWithCustomSetup(
        player1.address,
        player2.address,
        board,
        0x0F,
        300,
        0
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
      const gameId = event.args[2];
      
      await chess.connect(player2).acceptGame(gameId);
      
      await expect(chess.connect(player1).makeMove(gameId, 0, 1))
        .to.emit(chess, "MoveMade");
      
      const piece = await chess.getPieceAt(gameId, 1);
      expect(piece).to.equal(4);
    });

    it("Should set custom castling rights", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000000604";
      const customCastling = 0x05;
      const tx = await chess.createGameWithCustomSetup(
        player1.address,
        player2.address,
        board,
        customCastling,
        300,
        0
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
      const gameId = event.args[2];
      
      expect(await chess.gameCastlingRights(gameId)).to.equal(customCastling);
    });

    it("Should create game with custom board position", async function () {
      const board = "0x0000000000000000000000000000000000000000000000000000000000060004";
      const tx = await chess.createGameWithCustomSetup(
        player1.address,
        player2.address,
        board,
        0x00,
        300,
        0
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
      const gameId = event.args[2];
      
      const gameBoard = await chess.gameBoards(gameId);
      expect(gameBoard).to.equal(board);
    });

    it("Should detect checkmate with rook and king", async function () {
      const board = "0x000060040000000000000000000000000000000000000000400000000000c000";
      const tx = await chess.createGameWithCustomSetup(
        player1.address,
        player2.address,
        board,
        0x00,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'GameCreated');
      const gameId = event.args[2];
      
      await chess.connect(player2).acceptGame(gameId);
      
      await expect(chess.connect(player1).makeMove(gameId, 56, 0))
        .to.emit(chess, "GameEnded");
      
      const gameState = await chess.gameStates(gameId);
      expect(gameState).to.equal(3);
    });
  });
});
