# Arpeggiator Pattern Directions Guide

This document explains the different pattern directions available in the Web Arpeggiator.

## Pattern Types

### 1. Up

- **Description**: Plays notes in ascending order
- **Visual**:
  ![Up Pattern](../public/images/patterns/pattern-direction-up.svg)
- **Example**: C4 → E4 → G4 → C5

### 2. Down

- **Description**: Plays notes in descending order
- **Visual**:
  ![Down Pattern](../public/images/patterns/pattern-direction-down.svg)
- **Example**: C5 → G4 → E4 → C4

### 3. Up-Down

- **Description**: Ascends then descends without repeating endpoints
- **Visual**:
  ![Up-Down Pattern](../public/images/patterns/pattern-direction-upDown.svg)
- **Example**: C4 → E4 → G4 → E4

### 4. Down-Up

- **Description**: Descends then ascends without repeating endpoints
- **Visual**:
  ![Down-Up Pattern](../public/images/patterns/pattern-direction-downUp.svg)
- **Example**: G4 → E4 → C4 → E4

### 5. Up-Down (Repeated)

- **Description**: Ascends then descends, repeating endpoints
- **Visual**:
  ![Up-Down (Repeated)](../public/images/patterns/pattern-direction-upDownRepeated.svg)
- **Example**: C4 → E4 → G4 → E4 → C4

### 6. Down-Up (Repeated)

- **Description**: Descends then ascends, repeating endpoints
- **Visual**:
  ![Down-Up (Repeated)](../public/images/patterns/pattern-direction-downUpRepeated.svg)
- **Example**: G4 → E4 → C4 → E4 → G4

### 7. Random Step

- **Description**: Selects a seeded random note independently on every step, so notes may repeat before others play
- **Visual**:
  ![Random Pattern](../public/images/patterns/pattern-direction-random.svg)
- **Example**: E4 → E4 → C4 → G4 (repeats are allowed)

### 8. Random Cycle

- **Description**: Plays every resolved note exactly once in a seeded shuffled order, then reshuffles for the next cycle
- **Visual**:
  ![Random Cycle](../public/images/patterns/pattern-direction-randomCycle.svg)
- **Example**: E4 → C4 → G4, then G4 → E4 → C4

### 9. Octave Cycle

- **Description**: Cycles through notes while ascending octaves
- **Visual**:
  ![Octave Cycle](../public/images/patterns/pattern-direction-octaveCycle.svg)
- **Example**: C4 → E4 → G4 → C5 → E5 → G5

### 10. Reversed Octaves

- **Description**: Cycles through notes while descending octaves
- **Visual**:
  ![Reversed Octaves](../public/images/patterns/pattern-direction-octaveCycleReversed.svg)
- **Example**: G5 → E5 → C5 → G4 → E4 → C4

### 11. Ping-Pong Octaves

- **Description**: Ascends then descends through octaves
- **Visual**:
  ![Ping-Pong Octaves](../public/images/patterns/pattern-direction-octaveCyclePingPong.svg)
- **Example**: C4 → E4 → G4 → C5 → G4 → E4

### 12. Random Walk

- **Description**: Moves continuously to adjacent notes, retaining its seeded position across cycle boundaries
- **Visual**:
  ![Random Walk](../public/images/patterns/pattern-direction-randomWalk.svg)
- **Example**: C4 → D4 → C4 → E4 → D4 (adjacent steps)

### 13. Drunkard's Walk

- **Description**: Moves continuously between nearby notes with occasional reflected two- or three-note leaps
- **Visual**:
  ![Drunkard's Walk](../public/images/patterns/pattern-direction-randomWalkDrunkard.svg)
- **Example**: C4 → D4 → E4 → A4 → G4 → F4 (mostly local with occasional leaps)
