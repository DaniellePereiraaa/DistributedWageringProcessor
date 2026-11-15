import { Decimal } from 'decimal.js';

/**
 * Immutable Money value object for financial operations.
 * Uses Decimal.js for precise decimal arithmetic.
 * Never use number/float for money - this class enforces 2 decimal places precision.
 */
export class Money {
  private readonly _amount: Decimal;

  private constructor(amount: Decimal) {
    // Ensure exactly 2 decimal places
    this._amount = new Decimal(amount.toFixed(2));
    Object.freeze(this);
  }

  /**
   * Creates a Money instance from a string representation.
   * String format prevents floating-point precision issues.
   * @param value - String representation of the amount (e.g., "100.50", "0.01")
   * @returns Money instance
   * @throws Error if value is invalid or negative
   */
  static fromString(value: string): Money {
    if (!value || value.trim() === '') {
      throw new Error('Money value cannot be empty');
    }

    const trimmed = value.trim();

    // Validate format: optional minus, digits, optional decimal with up to 4 places (PostgreSQL may return more)
    // We normalize to 2 decimal places internally
    const validFormat = /^-?\d+(\.\d+)?$/.test(trimmed);
    if (!validFormat) {
      throw new Error(`Invalid money format: ${value}. Use format like "100.50" or "100"`);
    }

    const decimal = new Decimal(trimmed);

    if (decimal.isNegative()) {
      throw new Error('Money value cannot be negative');
    }

    return new Money(decimal);
  }

  /**
   * Creates a Money instance from a number (cents).
   * Useful for internal calculations where cents are stored as integer.
   * @param cents - Amount in cents (e.g., 10050 for 100.50)
   * @returns Money instance
   */
  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new Error('Cents must be a non-negative integer');
    }
    return new Money(new Decimal(cents).dividedBy(100));
  }

  /**
   * Creates a zero Money instance.
   * @returns Money instance with value 0.00
   */
  static zero(): Money {
    return new Money(new Decimal(0));
  }

  /**
   * Gets the amount as a Decimal for precise calculations.
   * @returns Decimal instance
   */
  get amount(): Decimal {
    return this._amount;
  }

  /**
   * Gets the amount in cents as integer.
   * @returns Amount in cents
   */
  get cents(): number {
    return this._amount.mul(100).toNumber();
  }

  /**
   * Adds another Money to this one.
   * @param other - Money to add
   * @returns New Money instance with the sum
   */
  add(other: Money): Money {
    return new Money(this._amount.plus(other._amount));
  }

  /**
   * Subtracts another Money from this one.
   * @param other - Money to subtract
   * @returns New Money instance with the difference
   * @throws Error if result would be negative
   */
  subtract(other: Money): Money {
    const result = this._amount.minus(other._amount);
    if (result.isNegative()) {
      throw new Error('Subtraction would result in negative money');
    }
    return new Money(result);
  }

  /**
   * Multiplies this Money by a factor.
   * @param factor - Multiplication factor (must be positive)
   * @returns New Money instance with the product
   */
  multiply(factor: number): Money {
    if (factor < 0) {
      throw new Error('Multiplication factor cannot be negative');
    }
    return new Money(this._amount.mul(factor));
  }

  /**
   * Divides this Money by a divisor.
   * @param divisor - Division divisor (must be positive)
   * @returns New Money instance with the quotient
   */
  divide(divisor: number): Money {
    if (divisor <= 0) {
      throw new Error('Division divisor must be positive');
    }
    return new Money(this._amount.div(divisor));
  }

  /**
   * Checks if this Money is greater than another.
   * @param other - Money to compare
   * @returns true if this > other
   */
  greaterThan(other: Money): boolean {
    return this._amount.greaterThan(other._amount);
  }

  /**
   * Checks if this Money is greater than or equal to another.
   * @param other - Money to compare
   * @returns true if this >= other
   */
  greaterThanOrEqual(other: Money): boolean {
    return this._amount.greaterThanOrEqualTo(other._amount);
  }

  /**
   * Checks if this Money is less than another.
   * @param other - Money to compare
   * @returns true if this < other
   */
  lessThan(other: Money): boolean {
    return this._amount.lessThan(other._amount);
  }

  /**
   * Checks if this Money is less than or equal to another.
   * @param other - Money to compare
   * @returns true if this <= other
   */
  lessThanOrEqual(other: Money): boolean {
    return this._amount.lessThanOrEqualTo(other._amount);
  }

  /**
   * Checks if this Money equals another.
   * @param other - Money to compare
   * @returns true if equal
   */
  equals(other: Money): boolean {
    return this._amount.equals(other._amount);
  }

  /**
   * Checks if this Money is zero.
   * @returns true if zero
   */
  isZero(): boolean {
    return this._amount.isZero();
  }

  /**
   * Checks if this Money is positive (greater than zero).
   * @returns true if positive
   */
  isPositive(): boolean {
    return this._amount.greaterThan(0);
  }

  /**
   * Returns string representation with exactly 2 decimal places.
   * @returns String like "100.50"
   */
  toString(): string {
    return this._amount.toFixed(2);
  }

  /**
   * Returns JSON-serializable value.
   * @returns String representation
   */
  toJSON(): string {
    return this.toString();
  }

  /**
   * Creates a Money instance from a JSON value.
   * @param value - String from JSON
   * @returns Money instance
   */
  static fromJSON(value: string): Money {
    return Money.fromString(value);
  }
}