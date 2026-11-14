import { Money } from '../src/common/value-objects/money.value-object';

describe('Money Value Object', () => {
  describe('Criação', () => {
    it('deve criar Money a partir de string válida', () => {
      const money = Money.fromString('100.50');
      expect(money.toString()).toBe('100.50');
      expect(money.cents).toBe(10050);
    });

    it('deve criar Money a partir de string sem decimais', () => {
      const money = Money.fromString('100');
      expect(money.toString()).toBe('100.00');
      expect(money.cents).toBe(10000);
    });

    it('deve criar Money a partir de string com um decimal', () => {
      const money = Money.fromString('100.5');
      expect(money.toString()).toBe('100.50');
      expect(money.cents).toBe(10050);
    });

    it('deve criar Money zero', () => {
      const money = Money.zero();
      expect(money.toString()).toBe('0.00');
      expect(money.isZero()).toBe(true);
    });

    it('deve criar Money a partir de centavos', () => {
      const money = Money.fromCents(10050);
      expect(money.toString()).toBe('100.50');
    });

    it('deve rejeitar string vazia', () => {
      expect(() => Money.fromString('')).toThrow('Money value cannot be empty');
      expect(() => Money.fromString('   ')).toThrow('Money value cannot be empty');
    });

    it('deve rejeitar formato inválido', () => {
      expect(() => Money.fromString('abc')).toThrow('Invalid money format');
      expect(() => Money.fromString('100.123')).toThrow('Invalid money format');
      expect(() => Money.fromString('100.1')).not.toThrow(); // 1 decimal é válido
    });

    it('deve rejeitar valor negativo', () => {
      expect(() => Money.fromString('-10.00')).toThrow('Money value cannot be negative');
      expect(() => Money.fromCents(-1)).toThrow('Cents must be a non-negative integer');
    });

    it('deve rejeitar centavos não-inteiros', () => {
      expect(() => Money.fromCents(100.5)).toThrow('Cents must be a non-negative integer');
    });
  });

  describe('Aritmética', () => {
    it('deve somar dois Money corretamente', () => {
      const a = Money.fromString('100.50');
      const b = Money.fromString('50.25');
      const result = a.add(b);
      expect(result.toString()).toBe('150.75');
    });

    it('deve subtrair dois Money corretamente', () => {
      const a = Money.fromString('100.50');
      const b = Money.fromString('30.25');
      const result = a.subtract(b);
      expect(result.toString()).toBe('70.25');
    });

    it('deve lançar erro ao subtrair valor maior', () => {
      const a = Money.fromString('50.00');
      const b = Money.fromString('100.00');
      expect(() => a.subtract(b)).toThrow('Subtraction would result in negative money');
    });

    it('deve multiplicar por fator', () => {
      const money = Money.fromString('100.00');
      const result = money.multiply(2.5);
      expect(result.toString()).toBe('250.00');
    });

    it('deve rejeitar multiplicação por fator negativo', () => {
      const money = Money.fromString('100.00');
      expect(() => money.multiply(-1)).toThrow('Multiplication factor cannot be negative');
    });

    it('deve dividir por divisor', () => {
      const money = Money.fromString('100.00');
      const result = money.divide(4);
      expect(result.toString()).toBe('25.00');
    });

    it('deve rejeitar divisão por zero ou negativo', () => {
      const money = Money.fromString('100.00');
      expect(() => money.divide(0)).toThrow('Division divisor must be positive');
      expect(() => money.divide(-1)).toThrow('Division divisor must be positive');
    });
  });

  describe('Comparação', () => {
    it('deve comparar greaterThan corretamente', () => {
      const a = Money.fromString('100.00');
      const b = Money.fromString('50.00');
      expect(a.greaterThan(b)).toBe(true);
      expect(b.greaterThan(a)).toBe(false);
    });

    it('deve comparar greaterThanOrEqual corretamente', () => {
      const a = Money.fromString('100.00');
      const b = Money.fromString('100.00');
      expect(a.greaterThanOrEqual(b)).toBe(true);
      expect(a.greaterThanOrEqual(Money.fromString('50.00'))).toBe(true);
    });

    it('deve comparar lessThan corretamente', () => {
      const a = Money.fromString('50.00');
      const b = Money.fromString('100.00');
      expect(a.lessThan(b)).toBe(true);
      expect(b.lessThan(a)).toBe(false);
    });

    it('deve comparar lessThanOrEqual corretamente', () => {
      const a = Money.fromString('100.00');
      const b = Money.fromString('100.00');
      expect(a.lessThanOrEqual(b)).toBe(true);
      expect(a.lessThanOrEqual(Money.fromString('150.00'))).toBe(true);
    });

    it('deve verificar igualdade', () => {
      const a = Money.fromString('100.00');
      const b = Money.fromString('100.00');
      const c = Money.fromString('100.01');
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });

    it('deve verificar isZero e isPositive', () => {
      expect(Money.zero().isZero()).toBe(true);
      expect(Money.fromString('0.00').isZero()).toBe(true);
      expect(Money.fromString('0.01').isZero()).toBe(false);
      expect(Money.fromString('0.01').isPositive()).toBe(true);
      expect(Money.zero().isPositive()).toBe(false);
    });
  });

  describe('Serialização', () => {
    it('deve serializar para JSON corretamente', () => {
      const money = Money.fromString('100.50');
      expect(money.toJSON()).toBe('100.50');
    });

    it('deve desserializar de JSON corretamente', () => {
      const money = Money.fromJSON('100.50');
      expect(money.toString()).toBe('100.50');
    });

    it('deve rejeitar mais de 2 casas decimais', () => {
      expect(() => Money.fromString('100.555')).toThrow('Invalid money format');
    });

    it('deve manter precisão de 2 casas decimais em operações', () => {
      const a = Money.fromString('100.55');
      const b = Money.fromString('0.01');
      const result = a.add(b);
      expect(result.toString()).toBe('100.56');
    });
  });

  describe('Precisão decimal', () => {
    it('deve evitar erros de ponto flutuante', () => {
      // 0.1 + 0.2 = 0.30000000000000004 em float
      // Com Money deve ser exato
      const a = Money.fromString('0.10');
      const b = Money.fromString('0.20');
      const result = a.add(b);
      expect(result.toString()).toBe('0.30');
    });

    it('deve manter precisão em múltiplas operações', () => {
      let money = Money.fromString('0.10');
      for (let i = 0; i < 10; i++) {
        money = money.add(Money.fromString('0.10'));
      }
      expect(money.toString()).toBe('1.10');
    });
  });
});