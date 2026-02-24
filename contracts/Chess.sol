// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Chess {
    enum GameState { PENDING, ACTIVE, DRAW, WHITE_WON, BLACK_WON, ABANDONED, CANCELLED }
    
    // Piece encoding: 0=empty, 1-6=white, 7-12=black
    // 1=Pawn, 2=Knight, 3=Bishop, 4=Rook, 5=Queen, 6=King
    
    mapping(uint256 => address) public gameCreators;
    mapping(uint256 => address) public gameOpponents;
    mapping(uint256 => uint8) public gameCurrentPlayer;
    mapping(uint256 => GameState) public gameStates;
    mapping(uint256 => uint256) public gameMoveCounts;
    mapping(uint256 => uint256) public gameWhiteTime;
    mapping(uint256 => uint256) public gameBlackTime;
    mapping(uint256 => uint256) public gameTimeControl;
    mapping(uint256 => uint256) public gameLastMoveTime;
    mapping(uint256 => bytes32) public gameBoards;
    mapping(uint256 => uint8) public gameEnPassantSquare;
    mapping(uint256 => uint8) public gameCastlingRights;
    mapping(uint256 => uint256) public halfMovesWithoutCapture;
    mapping(uint256 => uint256) public maxHalfMovesWithoutCapture;
    mapping(uint256 => address) public drawOfferedBy;
    mapping(uint256 => mapping(bytes32 => uint8)) public positionCount;
    
    uint256 public nextGameId = 0;

    event GameCreated(address indexed creator, address indexed opponent, uint256 indexed gameId, uint256 timeControl, uint256 maxHalfMovesWithoutCapture);
    event GameAccepted(uint256 indexed gameId);
    event MoveMade(uint256 indexed gameId, uint8 fromSquare, uint8 toSquare, uint8 pieceMoved, uint8 promotionPiece);
    event GameEnded(uint256 indexed gameId, GameState result);
    event TimeExpired(uint256 indexed gameId, uint8 player);
    event DrawOffered(uint256 indexed gameId, address indexed offeredBy);
    event DrawAccepted(uint256 indexed gameId);
    event DrawDeclined(uint256 indexed gameId);
    event DrawOfferWithdrawn(uint256 indexed gameId);
    event GameCancelled(uint256 indexed gameId);

    function createGame(address _opponent, uint256 _timeControl, uint256 _maxHalfMovesWithoutCapture) external returns (uint256) {
        require(_opponent != address(0), "Invalid opponent address");
        require(_opponent != msg.sender, "Cannot play against yourself");
        uint256 gameId = nextGameId++;
        
        gameCreators[gameId] = msg.sender;
        gameOpponents[gameId] = _opponent;
        gameCurrentPlayer[gameId] = 0;
        gameStates[gameId] = GameState.PENDING;
        gameMoveCounts[gameId] = 0;
        gameTimeControl[gameId] = _timeControl;
        gameWhiteTime[gameId] = _timeControl;
        gameBlackTime[gameId] = _timeControl;
        gameBoards[gameId] = INITIAL_BOARD;
        gameEnPassantSquare[gameId] = 255;
        gameCastlingRights[gameId] = 0x0F;
        maxHalfMovesWithoutCapture[gameId] = _maxHalfMovesWithoutCapture;
        halfMovesWithoutCapture[gameId] = 0;
        
        emit GameCreated(msg.sender, _opponent, gameId, _timeControl, _maxHalfMovesWithoutCapture);
        return gameId;
    }

    function createGame(address _opponent, uint256 _timeControl) external returns (uint256) {
        require(_opponent != address(0), "Invalid opponent address");
        require(_opponent != msg.sender, "Cannot play against yourself");
        uint256 gameId = nextGameId++;
        
        gameCreators[gameId] = msg.sender;
        gameOpponents[gameId] = _opponent;
        gameCurrentPlayer[gameId] = 0;
        gameStates[gameId] = GameState.PENDING;
        gameMoveCounts[gameId] = 0;
        gameTimeControl[gameId] = _timeControl;
        gameWhiteTime[gameId] = _timeControl;
        gameBlackTime[gameId] = _timeControl;
        gameBoards[gameId] = INITIAL_BOARD;
        gameEnPassantSquare[gameId] = 255;
        gameCastlingRights[gameId] = 0x0F;
        maxHalfMovesWithoutCapture[gameId] = 0;
        halfMovesWithoutCapture[gameId] = 0;
        
        emit GameCreated(msg.sender, _opponent, gameId, _timeControl, 0);
        return gameId;
    }

    bytes32 public constant INITIAL_BOARD = bytes32(hex"a89cb98a77777777000000000000000000000000000000001111111142365324");

    function _setPiece(bytes32 _board, uint8 _square, uint8 _piece) internal pure returns (bytes32) {
        uint8 shift = _square * 4;
        return bytes32((uint256(_board) & ~(uint256(0xF) << shift)) | (uint256(_piece) << shift));
    }

    function _getPiece(bytes32 _board, uint8 _square) internal pure returns (uint8) {
        return uint8((uint256(_board) >> (_square * 4)) & 0xF);
    }

    function _isWhite(uint8 _piece) internal pure returns (bool) {
        return _piece >= 1 && _piece <= 6;
    }

    function _isBlack(uint8 _piece) internal pure returns (bool) {
        return _piece >= 7 && _piece <= 12;
    }

    function _pieceColor(uint8 _piece) internal pure returns (uint8) {
        if (_isWhite(_piece)) return 0;
        if (_isBlack(_piece)) return 1;
        return 255;
    }

    function _pieceType(uint8 _piece) internal pure returns (uint8) {
        if (_piece == 0) return 0;
        if (_isWhite(_piece)) return _piece;
        return _piece - 6;
    }

    function acceptGame(uint256 _gameId) external {
        require(gameStates[_gameId] == GameState.PENDING, "Game is not pending");
        require(gameOpponents[_gameId] == msg.sender, "Only opponent can accept");
        
        gameStates[_gameId] = GameState.ACTIVE;
        gameCurrentPlayer[_gameId] = 0;
        gameLastMoveTime[_gameId] = block.timestamp;
        
        bytes32 positionHash = _computePositionHash(gameBoards[_gameId], gameCastlingRights[_gameId], gameEnPassantSquare[_gameId], 0);
        positionCount[_gameId][positionHash] = 1;
        
        emit GameAccepted(_gameId);
    }
    
    function cancelGame(uint256 _gameId) external {
        require(gameStates[_gameId] == GameState.PENDING, "Can only cancel pending games");
        require(gameCreators[_gameId] == msg.sender, "Only creator can cancel");
        gameStates[_gameId] = GameState.CANCELLED;
        emit GameCancelled(_gameId);
    }

    function makeMove(uint256 _gameId, uint8 _fromSquare, uint8 _toSquare) external {
        makeMoveWithPromotion(_gameId, _fromSquare, _toSquare, 0);
    }

    function makeMoveWithPromotion(uint256 _gameId, uint8 _fromSquare, uint8 _toSquare, uint8 _promotionPiece) public {
        require(gameStates[_gameId] == GameState.ACTIVE, "Game is not active");
        require(msg.sender == gameCreators[_gameId] || msg.sender == gameOpponents[_gameId], "Not a player in this game");
        require((gameCurrentPlayer[_gameId] == 0 && msg.sender == gameCreators[_gameId]) ||
                (gameCurrentPlayer[_gameId] == 1 && msg.sender == gameOpponents[_gameId]), "Not your turn");
        require(_fromSquare < 64 && _toSquare < 64, "Invalid square");
        require(_fromSquare != _toSquare, "Cannot move to same square");

        if (gameTimeControl[_gameId] > 0) {
            uint256 elapsed = block.timestamp - gameLastMoveTime[_gameId];
            uint8 player = gameCurrentPlayer[_gameId];
            if (player == 0) {
                if (elapsed >= gameWhiteTime[_gameId]) {
                    gameWhiteTime[_gameId] = 0;
                    gameStates[_gameId] = GameState.BLACK_WON;
                    emit TimeExpired(_gameId, 0);
                    emit GameEnded(_gameId, GameState.BLACK_WON);
                    return;
                }
                gameWhiteTime[_gameId] -= elapsed;
            } else {
                if (elapsed >= gameBlackTime[_gameId]) {
                    gameBlackTime[_gameId] = 0;
                    gameStates[_gameId] = GameState.WHITE_WON;
                    emit TimeExpired(_gameId, 1);
                    emit GameEnded(_gameId, GameState.WHITE_WON);
                    return;
                }
                gameBlackTime[_gameId] -= elapsed;
            }
        }
        
        gameLastMoveTime[_gameId] = block.timestamp;

        bytes32 board = gameBoards[_gameId];
        uint8 fromPiece = _getPiece(board, _fromSquare);
        uint8 toPiece = _getPiece(board, _toSquare);
        uint8 currentPlayer = gameCurrentPlayer[_gameId];
        uint8 enPassantSquare = gameEnPassantSquare[_gameId];
        uint8 castlingRights = gameCastlingRights[_gameId];

        require(fromPiece != 0, "No piece on source square");
        require(_pieceColor(fromPiece) == currentPlayer, "Not your piece");
        require(!_isSameColor(fromPiece, toPiece), "Cannot capture own piece");

        _validateAndMakeMove(_gameId, board, _fromSquare, _toSquare, fromPiece, toPiece, currentPlayer, enPassantSquare, castlingRights, _promotionPiece);
        
        gameMoveCounts[_gameId]++;
        gameCurrentPlayer[_gameId] = 1 - currentPlayer;

        _checkGameEnd(_gameId);
        
        emit MoveMade(_gameId, _fromSquare, _toSquare, fromPiece, _promotionPiece);
    }

    function _isSameColor(uint8 _piece1, uint8 _piece2) internal pure returns (bool) {
        if (_piece1 == 0 || _piece2 == 0) return false;
        return _isWhite(_piece1) == _isWhite(_piece2);
    }

    function _validateAndMakeMove(uint256 _gameId, bytes32 _board, uint8 _from, uint8 _to, uint8 _fromPiece, uint8 _toPiece, uint8 _player, uint8 _enPassant, uint8 _castling, uint8 _promo) internal {
        uint8 pieceT = _pieceType(_fromPiece);
        int8 df = int8(_to % 8) - int8(_from % 8);
        int8 dr = int8(_to / 8) - int8(_from / 8);

        uint8 specialMove = 0;
        bool valid;

        if (pieceT == 1) (valid, specialMove) = _validatePawnMove(_board, _from, _to, _player, _enPassant, df, dr, _toPiece);
        else if (pieceT == 2) valid = _validateKnightMove(df, dr);
        else if (pieceT == 3) valid = _validateBishopMove(_board, _from, _to, df, dr);
        else if (pieceT == 4) valid = _validateRookMove(_board, _from, _to, df, dr);
        else if (pieceT == 5) valid = _validateQueenMove(_board, _from, _to, df, dr);
        else if (pieceT == 6) (valid, specialMove) = _validateKingMove(_board, _from, _to, _player, df, dr, _castling, _toPiece);
        else valid = false;

        require(valid, "Invalid move");
        if (specialMove == 3) require(_promo >= 2 && _promo <= 5, "Invalid promotion piece");

        _executeMove(_gameId, _board, _from, _to, _fromPiece, _player, _enPassant, _castling, specialMove, _promo);
    }

    function _validatePawnMove(bytes32 _board, uint8 _from, uint8 _to, uint8 _player, uint8 _enPassant, int8 _df, int8 _dr, uint8 _toPiece) internal pure returns (bool, uint8) {
        int8 direction = _player == 0 ? int8(1) : int8(-1);
        uint8 startRank = _player == 0 ? 1 : 6;
        uint8 promoRank = _player == 0 ? 7 : 0;
        
        if (_df == 0 && _toPiece == 0) {
            if (_dr == direction) {
                if (_to / 8 == promoRank) return (true, 3);
                return (true, 0);
            }
            if (_dr == 2 * direction && _from / 8 == startRank) {
                uint8 midSquare = _player == 0 ? _from + 8 : _from - 8;
                if (_getPiece(_board, midSquare) == 0) return (true, 0);
            }
        }
        if (abs(_df) == 1 && _dr == direction) {
            if (_toPiece != 0) {
                if (_to / 8 == promoRank) return (true, 3);
                return (true, 0);
            }
            if (_to == _enPassant) return (true, 2);
        }
        return (false, 0);
    }

    function _validateKnightMove(int8 _df, int8 _dr) internal pure returns (bool) {
        int8 adf = abs(_df);
        int8 adr = abs(_dr);
        return (adf == 1 && adr == 2) || (adf == 2 && adr == 1);
    }

    function _validateBishopMove(bytes32 _board, uint8 _from, uint8 _to, int8 _df, int8 _dr) internal pure returns (bool) {
        if (abs(_df) != abs(_dr) || _df == 0) return false;
        return _isPathClear(_board, _from, _to, _df, _dr);
    }

    function _validateRookMove(bytes32 _board, uint8 _from, uint8 _to, int8 _df, int8 _dr) internal pure returns (bool) {
        if (_df != 0 && _dr != 0) return false;
        return _isPathClear(_board, _from, _to, _df, _dr);
    }

    function _validateQueenMove(bytes32 _board, uint8 _from, uint8 _to, int8 _df, int8 _dr) internal pure returns (bool) {
        if (_df == 0 || _dr == 0 || abs(_df) == abs(_dr)) return _isPathClear(_board, _from, _to, _df, _dr);
        return false;
    }

    function _validateKingMove(bytes32 _board, uint8 _from, uint8 _to, uint8 _player, int8 _df, int8 _dr, uint8 _castling, uint8 _toPiece) internal view returns (bool, uint8) {
        int8 adf = abs(_df);
        int8 adr = abs(_dr);
        if (adf <= 1 && adr <= 1) return (true, 0);
        
        if (adf == 2 && adr == 0 && _toPiece == 0) {
            uint8 rank = _player == 0 ? 0 : 7;
            if (_from / 8 != rank || _to / 8 != rank) return (false, 0);
            bool kingside = _df == 2;
            uint8 rookSquare = rank * 8 + (kingside ? 7 : 0);
            uint8 rookPiece = _getPiece(_board, rookSquare);
            uint8 expectedRook = _player == 0 ? 4 : 10;
            if (rookPiece != expectedRook) return (false, 0);
            uint8 rightBit = _player == 0 ? (kingside ? 0 : 1) : (kingside ? 2 : 3);
            if ((_castling >> rightBit) & 1 == 0) return (false, 0);
            int8 step = kingside ? int8(1) : int8(-1);
            for (int8 f = int8(_from % 8) + step; f != int8(_to % 8); f += step) {
                if (_getPiece(_board, rank * 8 + uint8(f)) != 0) return (false, 0);
            }
            if (_isSquareAttacked(_board, _from, 1 - _player)) return (false, 0);
            uint8 midSquare = _from + uint8(step);
            if (_isSquareAttacked(_board, midSquare, 1 - _player)) return (false, 0);
            if (_isSquareAttacked(_board, _to, 1 - _player)) return (false, 0);
            return (true, 1);
        }
        return (false, 0);
    }

    function _isPathClear(bytes32 _board, uint8 _from, uint8 _to, int8 _df, int8 _dr) internal pure returns (bool) {
        int8 stepF = _df == 0 ? int8(0) : (_df > 0 ? int8(1) : int8(-1));
        int8 stepR = _dr == 0 ? int8(0) : (_dr > 0 ? int8(1) : int8(-1));
        uint8 f = uint8(int8(_from % 8) + stepF);
        uint8 r = uint8(int8(_from / 8) + stepR);
        while (f != _to % 8 || r != _to / 8) {
            if (_getPiece(_board, r * 8 + f) != 0) return false;
            f = uint8(int8(f) + stepF);
            r = uint8(int8(r) + stepR);
        }
        return true;
    }

    function abs(int8 _v) internal pure returns (int8) { return _v < 0 ? -_v : _v; }

    function _computePositionHash(bytes32 _board, uint8 _castlingRights, uint8 _enPassant, uint8 _currentPlayer) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_board, _castlingRights, _enPassant, _currentPlayer));
    }

    function _executeMove(uint256 _gameId, bytes32 _board, uint8 _from, uint8 _to, uint8 _fromPiece, uint8 _player, uint8 _enPassant, uint8 _castling, uint8 _special, uint8 _promo) internal {
        uint8 newEnPassant = 255;
        uint8 newCastling = _castling;
        uint8 pieceT = _pieceType(_fromPiece);
        uint8 toPiece = _getPiece(_board, _to);
        bool isCapture = toPiece != 0 || _special == 2;
        bool isPawnMove = pieceT == 1;
        
        if (_special == 2) {
            uint8 capturedPawnSquare = _player == 0 ? _to - 8 : _to + 8;
            _board = _setPiece(_board, capturedPawnSquare, 0);
        }
        if (_special == 1) {
            uint8 rank = _player == 0 ? 0 : 7;
            bool kingside = _to % 8 > _from % 8;
            uint8 rookFrom = rank * 8 + (kingside ? 7 : 0);
            uint8 rookTo = rank * 8 + (kingside ? 5 : 3);
            uint8 rookPiece = _player == 0 ? 4 : 10;
            _board = _setPiece(_board, rookFrom, 0);
            _board = _setPiece(_board, rookTo, rookPiece);
        }
        if (pieceT == 1 && abs(int8(_to / 8) - int8(_from / 8)) == 2) {
            newEnPassant = _player == 0 ? _to - 8 : _to + 8;
        }
        if (pieceT == 6) {
            if (_player == 0) newCastling &= 0xFC; else newCastling &= 0x3F;
        }
        if (pieceT == 4) {
            if (_from == 0) newCastling &= 0xFD;
            if (_from == 7) newCastling &= 0xFE;
            if (_from == 56) newCastling &= 0xDF;
            if (_from == 63) newCastling &= 0xEF;
        }
        if (_to == 0) newCastling &= 0xFD;
        if (_to == 7) newCastling &= 0xFE;
        if (_to == 56) newCastling &= 0xDF;
        if (_to == 63) newCastling &= 0xEF;
        
        _board = _setPiece(_board, _from, 0);
        if (_special == 3 && _promo >= 2 && _promo <= 5) {
            uint8 promotedPiece = _player == 0 ? _promo : _promo + 6;
            _board = _setPiece(_board, _to, promotedPiece);
        } else {
            _board = _setPiece(_board, _to, _fromPiece);
        }
        
        require(!_isKingInCheck(_board, _player), "Move leaves king in check");
        
        if (isCapture || isPawnMove) halfMovesWithoutCapture[_gameId] = 0;
        else halfMovesWithoutCapture[_gameId]++;
        
        uint8 nextPlayer = 1 - _player;
        bytes32 positionHash = _computePositionHash(_board, newCastling, newEnPassant, nextPlayer);
        positionCount[_gameId][positionHash]++;
        
        gameBoards[_gameId] = _board;
        gameEnPassantSquare[_gameId] = newEnPassant;
        gameCastlingRights[_gameId] = newCastling;
    }

    function _isKingInCheck(bytes32 _board, uint8 _player) internal view returns (bool) {
        uint8 kingSquare = _findKing(_board, _player);
        if (kingSquare == 255) return false;
        return _isSquareAttacked(_board, kingSquare, 1 - _player);
    }

    function _findKing(bytes32 _board, uint8 _player) internal pure returns (uint8) {
        uint8 king = _player == 0 ? 6 : 12;
        for (uint8 i = 0; i < 64; i++) {
            if (_getPiece(_board, i) == king) return i;
        }
        return 255;
    }

    function _isSquareAttacked(bytes32 _board, uint8 _square, uint8 _byPlayer) internal view returns (bool) {
        uint8 targetFile = _square % 8;
        uint8 targetRank = _square / 8;
        for (uint8 i = 0; i < 64; i++) {
            uint8 piece = _getPiece(_board, i);
            if (piece == 0) continue;
            if (_pieceColor(piece) != _byPlayer) continue;
            uint8 pieceT = _pieceType(piece);
            int8 df = int8(targetFile) - int8(i % 8);
            int8 dr = int8(targetRank) - int8(i / 8);
            if (pieceT == 1) {
                int8 direction = _byPlayer == 0 ? int8(1) : int8(-1);
                if (abs(df) == 1 && dr == direction) return true;
            } else if (pieceT == 2) {
                if (_validateKnightMove(df, dr)) return true;
            } else if (pieceT == 3) {
                if (_validateBishopMove(_board, i, _square, df, dr)) return true;
            } else if (pieceT == 4) {
                if (_validateRookMove(_board, i, _square, df, dr)) return true;
            } else if (pieceT == 5) {
                if (_validateQueenMove(_board, i, _square, df, dr)) return true;
            } else if (pieceT == 6) {
                if (abs(df) <= 1 && abs(dr) <= 1) return true;
            }
        }
        return false;
    }

    function _checkGameEnd(uint256 _gameId) internal {
        uint256 maxMoves = maxHalfMovesWithoutCapture[_gameId];
        if (maxMoves > 0 && halfMovesWithoutCapture[_gameId] >= maxMoves) {
            gameStates[_gameId] = GameState.DRAW;
            emit GameEnded(_gameId, GameState.DRAW);
            return;
        }
        bytes32 positionHash = _computePositionHash(gameBoards[_gameId], gameCastlingRights[_gameId], gameEnPassantSquare[_gameId], gameCurrentPlayer[_gameId]);
        if (positionCount[_gameId][positionHash] >= 3) {
            gameStates[_gameId] = GameState.DRAW;
            emit GameEnded(_gameId, GameState.DRAW);
            return;
        }
        
        // Check insufficient material
        bytes32 board = gameBoards[_gameId];
        if (_isInsufficientMaterial(board)) {
            gameStates[_gameId] = GameState.DRAW;
            emit GameEnded(_gameId, GameState.DRAW);
            return;
        }
        
        uint8 nextPlayer = gameCurrentPlayer[_gameId];
        bool hasLegalMove = false;
        for (uint8 from = 0; from < 64 && !hasLegalMove; from++) {
            uint8 fromPiece = _getPiece(board, from);
            if (fromPiece == 0 || _pieceColor(fromPiece) != nextPlayer) continue;
            for (uint8 to = 0; to < 64 && !hasLegalMove; to++) {
                if (from == to) continue;
                uint8 toPiece = _getPiece(board, to);
                if (_isSameColor(fromPiece, toPiece)) continue;
                if (_isLegalMove(_gameId, board, from, to, fromPiece, toPiece, nextPlayer)) hasLegalMove = true;
            }
        }
        if (!hasLegalMove) {
            if (_isKingInCheck(board, nextPlayer)) {
                gameStates[_gameId] = nextPlayer == 0 ? GameState.BLACK_WON : GameState.WHITE_WON;
            } else {
                gameStates[_gameId] = GameState.DRAW;
            }
            emit GameEnded(_gameId, gameStates[_gameId]);
        }
    }

    function _isLegalMove(uint256 _gameId, bytes32 _board, uint8 _from, uint8 _to, uint8 _fromPiece, uint8 _toPiece, uint8 _player) internal view returns (bool) {
        uint8 pieceT = _pieceType(_fromPiece);
        int8 df = int8(_to % 8) - int8(_from % 8);
        int8 dr = int8(_to / 8) - int8(_from / 8);
        uint8 enPassant = gameEnPassantSquare[_gameId];
        uint8 castling = gameCastlingRights[_gameId];
        bool valid; uint8 special;
        if (pieceT == 1) (valid, special) = _validatePawnMove(_board, _from, _to, _player, enPassant, df, dr, _toPiece);
        else if (pieceT == 2) { valid = _validateKnightMove(df, dr); special = 0; }
        else if (pieceT == 3) { valid = _validateBishopMove(_board, _from, _to, df, dr); special = 0; }
        else if (pieceT == 4) { valid = _validateRookMove(_board, _from, _to, df, dr); special = 0; }
        else if (pieceT == 5) { valid = _validateQueenMove(_board, _from, _to, df, dr); special = 0; }
        else if (pieceT == 6) (valid, special) = _validateKingMove(_board, _from, _to, _player, df, dr, castling, _toPiece);
        else { valid = false; special = 0; }
        if (!valid) return false;
        bytes32 newBoard = _simulateMove(_board, _from, _to, _fromPiece, _player, special);
        return !_isKingInCheck(newBoard, _player);
    }

    function _simulateMove(bytes32 _board, uint8 _from, uint8 _to, uint8 _fromPiece, uint8 _player, uint8 _special) internal pure returns (bytes32) {
        bytes32 newBoard = _board;
        if (_special == 2) {
            uint8 capturedPawnSquare = _player == 0 ? _to - 8 : _to + 8;
            newBoard = _setPiece(newBoard, capturedPawnSquare, 0);
        }
        if (_special == 1) {
            uint8 rank = _player == 0 ? 0 : 7;
            bool kingside = _to % 8 > _from % 8;
            uint8 rookFrom = rank * 8 + (kingside ? 7 : 0);
            uint8 rookTo = rank * 8 + (kingside ? 5 : 3);
            uint8 rookPiece = _player == 0 ? 4 : 10;
            newBoard = _setPiece(newBoard, rookFrom, 0);
            newBoard = _setPiece(newBoard, rookTo, rookPiece);
        }
        newBoard = _setPiece(newBoard, _from, 0);
        newBoard = _setPiece(newBoard, _to, _fromPiece);
        return newBoard;
    }

    function resign(uint256 _gameId) external {
        require(msg.sender == gameCreators[_gameId] || msg.sender == gameOpponents[_gameId], "Not a player in this game");
        require(gameStates[_gameId] == GameState.PENDING || gameStates[_gameId] == GameState.ACTIVE, "Game is already ended");
        if (msg.sender == gameCreators[_gameId]) gameStates[_gameId] = GameState.BLACK_WON;
        else gameStates[_gameId] = GameState.WHITE_WON;
        emit GameEnded(_gameId, gameStates[_gameId]);
    }

    function offerDraw(uint256 _gameId) external {
        require(msg.sender == gameCreators[_gameId] || msg.sender == gameOpponents[_gameId], "Not a player in this game");
        require(gameStates[_gameId] == GameState.ACTIVE, "Game is not active");
        drawOfferedBy[_gameId] = msg.sender;
        emit DrawOffered(_gameId, msg.sender);
    }
    
    function acceptDraw(uint256 _gameId) external {
        require(msg.sender == gameCreators[_gameId] || msg.sender == gameOpponents[_gameId], "Not a player in this game");
        require(gameStates[_gameId] == GameState.ACTIVE, "Game is not active");
        require(drawOfferedBy[_gameId] != address(0), "No draw offer pending");
        require(drawOfferedBy[_gameId] != msg.sender, "Cannot accept own draw offer");
        gameStates[_gameId] = GameState.DRAW;
        drawOfferedBy[_gameId] = address(0);
        emit DrawAccepted(_gameId);
        emit GameEnded(_gameId, GameState.DRAW);
    }
    
    function declineDraw(uint256 _gameId) external {
        require(msg.sender == gameCreators[_gameId] || msg.sender == gameOpponents[_gameId], "Not a player in this game");
        require(gameStates[_gameId] == GameState.ACTIVE, "Game is not active");
        require(drawOfferedBy[_gameId] != address(0), "No draw offer pending");
        require(drawOfferedBy[_gameId] != msg.sender, "Cannot decline own draw offer");
        drawOfferedBy[_gameId] = address(0);
        emit DrawDeclined(_gameId);
    }
    
    function withdrawDrawOffer(uint256 _gameId) external {
        require(msg.sender == gameCreators[_gameId] || msg.sender == gameOpponents[_gameId], "Not a player in this game");
        require(gameStates[_gameId] == GameState.ACTIVE, "Game is not active");
        require(drawOfferedBy[_gameId] == msg.sender, "No draw offer to withdraw");
        drawOfferedBy[_gameId] = address(0);
        emit DrawOfferWithdrawn(_gameId);
    }

    function getGame(uint256 _gameId) external view returns (address creator, address opponent, uint8 currentPlayer, GameState state, uint256 moveCount, uint256 whiteTime, uint256 blackTime, uint256 timeControl, uint256 _halfMovesWithoutCapture, uint256 _maxHalfMovesWithoutCapture, address _drawOfferedBy) {
        return (gameCreators[_gameId], gameOpponents[_gameId], gameCurrentPlayer[_gameId], gameStates[_gameId], gameMoveCounts[_gameId], gameWhiteTime[_gameId], gameBlackTime[_gameId], gameTimeControl[_gameId], halfMovesWithoutCapture[_gameId], maxHalfMovesWithoutCapture[_gameId], drawOfferedBy[_gameId]);
    }

    function getBoard(uint256 _gameId) external view returns (bytes32) { return gameBoards[_gameId]; }
    function getPieceAt(uint256 _gameId, uint8 _square) external view returns (uint8) { return _getPiece(gameBoards[_gameId], _square); }

    function getGameState(uint256 _gameId) external view returns (bytes32 board, uint8 currentPlayer, uint8 enPassantSquare, uint8 castlingRights, GameState state) {
        return (gameBoards[_gameId], gameCurrentPlayer[_gameId], gameEnPassantSquare[_gameId], gameCastlingRights[_gameId], gameStates[_gameId]);
    }

    function _isInsufficientMaterial(bytes32 _board) internal pure returns (bool) {
        uint8 whiteKnights = 0;
        uint8 whiteBishops = 0;
        uint8 whiteRooks = 0;
        uint8 whiteQueens = 0;
        uint8 whitePawns = 0;
        uint8 blackKnights = 0;
        uint8 blackBishops = 0;
        uint8 blackRooks = 0;
        uint8 blackQueens = 0;
        uint8 blackPawns = 0;
        uint8 whiteBishopSquareColor = 255;
        uint8 blackBishopSquareColor = 255;
        
        for (uint8 i = 0; i < 64; i++) {
            uint8 piece = _getPiece(_board, i);
            if (piece == 0) continue;
            uint8 pt = _pieceType(piece);
            if (pt == 1) {
                if (_isWhite(piece)) whitePawns++;
                else blackPawns++;
            } else if (pt == 2) {
                if (_isWhite(piece)) whiteKnights++;
                else blackKnights++;
            } else if (pt == 3) {
                uint8 squareColor = ((i / 8) + (i % 8)) % 2;
                if (_isWhite(piece)) {
                    whiteBishops++;
                    whiteBishopSquareColor = squareColor;
                } else {
                    blackBishops++;
                    blackBishopSquareColor = squareColor;
                }
            } else if (pt == 4) {
                if (_isWhite(piece)) whiteRooks++;
                else blackRooks++;
            } else if (pt == 5) {
                if (_isWhite(piece)) whiteQueens++;
                else blackQueens++;
            }
        }
        
        if (whitePawns > 0 || blackPawns > 0) return false;
        if (whiteRooks > 0 || blackRooks > 0) return false;
        if (whiteQueens > 0 || blackQueens > 0) return false;
        
        uint8 whiteMinor = whiteKnights + whiteBishops;
        uint8 blackMinor = blackKnights + blackBishops;
        
        if (whiteMinor == 0 && blackMinor == 0) return true;
        if (whiteMinor == 0 && blackMinor == 1) return true;
        if (whiteMinor == 1 && blackMinor == 0) return true;
        if (whiteMinor == 1 && blackMinor == 1) {
            if (whiteBishops == 1 && blackBishops == 1 && whiteBishopSquareColor == blackBishopSquareColor) return true;
        }
        
        return false;
    }
}
