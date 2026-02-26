# Chess Smart Contract

[![Tests](https://github.com/auryn-macmillan/chess/actions/workflows/tests.yml/badge.svg)](https://github.com/auryn-macmillan/chess/actions/workflows/tests.yml)
[![Coverage](https://img.shields.io/badge/coverage-92%25-brightgreen)](https://github.com/auryn-macmillan/chess/actions/workflows/tests.yml)

A production-ready, fully-featured chess smart contract implemented in Solidity. Play chess on-chain with complete rule enforcement, time controls, and tournament-standard draw conditions.

## Features

### Complete Chess Rules
- **All piece movements**: Pawns, Knights, Bishops, Rooks, Queens, and Kings with full validation
- **Castling**: Both kingside (O-O) and queenside (O-O-O) with all FIDE rules
- **En Passant**: Full support for this special pawn capture
- **Pawn Promotion**: Automatic detection with promotion to Queen, Rook, Bishop, or Knight
- **Check/Checkmate/Stalemate**: Complete detection of game-ending conditions

### Time Controls
- Configurable time control per game (0 = infinite time)
- Separate clocks for white and black
- Automatic loss on time expiry

### Draw Conditions
- **Mutual Agreement**: Offer/Accept/Decline/Withdraw draw mechanism
- **50-Move Rule**: Optional - game creator specifies max half-moves without capture/pawn move
- **Threefold Repetition**: Automatic draw when position repeats 3 times
- **Stalemate**: Automatic draw when no legal moves available

### Game Management
- **Game Creation**: Create games with specific opponent and settings
- **Game Cancellation**: Creator can cancel pending games
- **Resignation**: Either player can resign at any time during active game

### Security & Gas Optimization
- Efficient board representation using bytes32 (4 bits per piece)
- Position hashing for threefold repetition using keccak256
- Comprehensive input validation and access control

## Installation

```bash
npm install
```

## Compilation

```bash
npx hardhat compile
```

## Testing

Run all 127 tests:

```bash
npx hardhat test
```

## Contract API

### Game Creation

```solidity
function createGame(address _opponent, uint256 _timeControl) external returns (uint256)
function createGame(address _opponent, uint256 _timeControl, uint256 _maxHalfMovesWithoutCapture) external returns (uint256)
```

### Game Lifecycle

```solidity
function acceptGame(uint256 _gameId) external
function cancelGame(uint256 _gameId) external
```

### Making Moves

```solidity
function makeMove(uint256 _gameId, uint8 _fromSquare, uint8 _toSquare) external
function makeMoveWithPromotion(uint256 _gameId, uint8 _fromSquare, uint8 _toSquare, uint8 _promotionPiece) external
```

### Draw Mechanism

```solidity
function offerDraw(uint256 _gameId) external
function acceptDraw(uint256 _gameId) external
function declineDraw(uint256 _gameId) external
function withdrawDrawOffer(uint256 _gameId) external
```

### Resignation

```solidity
function resign(uint256 _gameId) external
```

## Board Representation

The board is stored as a `bytes32` value where each square uses 4 bits:

- Squares are indexed 0-63 (a1=0, h1=7, a2=8, ..., h8=63)
- Piece encoding:
  - 0 = empty
  - 1-6 = white pieces (Pawn, Knight, Bishop, Rook, Queen, King)
  - 7-12 = black pieces (Pawn, Knight, Bishop, Rook, Queen, King)

## Events

All events have indexed `gameId` for efficient filtering:

- `GameCreated` - Game created
- `GameAccepted` - Game accepted by opponent
- `MoveMade` - Move executed
- `GameEnded` - Game concluded
- `TimeExpired` - Player ran out of time
- `DrawOffered`, `DrawAccepted`, `DrawDeclined`, `DrawOfferWithdrawn` - Draw flow
- `GameCancelled` - Game cancelled by creator

## Game States

```solidity
enum GameState { 
    PENDING,      // 0 - Created but not yet accepted
    ACTIVE,       // 1 - In progress
    DRAW,         // 2 - Game ended in draw
    WHITE_WON,    // 3 - White won
    BLACK_WON,    // 4 - Black won
    ABANDONED,    // 5 - Game abandoned
    CANCELLED     // 6 - Game cancelled by creator
}
```

## Project Structure

```
contracts/
  Chess.sol           # Main contract (~760 lines)
test/
  Chess.test.cjs              # Core functionality tests
  Chess.Advanced.test.cjs     # Advanced feature tests
  Chess.E2E.test.cjs          # End-to-end game lifecycle
  Chess.Enhanced.test.cjs     # Time control tests
  Chess.FullRules.test.cjs    # Complete chess rules tests
  Chess.Security.test.cjs     # Security and edge case tests
  Chess.NewFeatures.test.cjs  # New features tests
scripts/
  deploy.js           # Deployment script
```

## License

MIT License - see [LICENSE](LICENSE) file for details.
