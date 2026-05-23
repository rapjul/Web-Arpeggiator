# Arpeggiator Pattern Directions Guide

This document explains the different pattern directions available in the Web Arpeggiator.

## Pattern Types

### 1. Up

- **Description**: Plays notes in ascending order
- **Visual**:
  ![Up Pattern](./images/patterns/pattern-direction-up.svg)
- **Example**: C4 → E4 → G4 → C5

### 2. Down

- **Description**: Plays notes in descending order
- **Visual**:
  ![Down Pattern](./images/patterns/pattern-direction-down.svg)
- **Example**: C5 → G4 → E4 → C4

### 3. Up-Down

- **Description**: Ascends then descends without repeating endpoints
- **Visual**:
  ![Up-Down Pattern](./images/patterns/pattern-direction-upDown.svg)
- **Example**: C4 → E4 → G4 → E4

### 4. Down-Up

- **Description**: Descends then ascends without repeating endpoints
- **Visual**:
  ![Down-Up Pattern](./images/patterns/pattern-direction-downUp.svg)
- **Example**: G4 → E4 → C4 → E4

### 5. Up-Down (Repeated)

- **Description**: Ascends then descends, repeating endpoints
- **Visual**:
  ![Up-Down (Repeated)](./images/patterns/pattern-direction-upDownRepeated.svg)
- **Example**: C4 → E4 → G4 → E4 → C4

### 6. Down-Up (Repeated)

- **Description**: Descends then ascends, repeating endpoints
- **Visual**:
  ![Down-Up (Repeated)](./images/patterns/pattern-direction-downUpRepeated.svg)
- **Example**: G4 → E4 → C4 → E4 → G4

### 7. Random

- **Description**: Plays notes in random order
- **Visual**:
  ![Random Pattern](./images/patterns/pattern-direction-random.svg)
- **Example**: E4 → C4 → G4 → C5 (random each time)

### 8. Octave Cycle

- **Description**: Cycles through notes while ascending octaves
- **Visual**:
  ![Octave Cycle](./images/patterns/pattern-direction-octaveCycle.svg)
- **Example**: C4 → E4 → G4 → C5 → E5 → G5

### 9. Reversed Octaves

- **Description**: Cycles through notes while descending octaves
- **Visual**:
  ![Reversed Octaves](./images/patterns/pattern-direction-octaveCycleReversed.svg)
- **Example**: G5 → E5 → C5 → G4 → E4 → C4

### 10. Ping-Pong Octaves

- **Description**: Ascends then descends through octaves
- **Visual**:
  ![Ping-Pong Octaves](./images/patterns/pattern-direction-octaveCyclePingPong.svg)
- **Example**: C4 → E4 → G4 → C5 → G4 → E4

### 11. Random Walk

- **Description**: Moves randomly to adjacent notes
- **Visual**:
  ![Random Walk](./images/patterns/pattern-direction-randomWalk.svg)
- **Example**: C4 → D4 → C4 → E4 → D4 (adjacent steps)

### 12. Drunkard's Walk

- **Description**: Random movement with momentum (tends to continue direction)
- **Visual**:
  ![Drunkard's Walk](./images/patterns/pattern-direction-randomWalkDrunkard.svg)
- **Example**: C4 → D4 → E4 → F4 → E4 → D4 (tends to continue direction)
