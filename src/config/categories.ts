import type { TransactionType } from '../types';

// Default categories offered in the form's datalist. They are suggestions,
// not a fixed set: the category field is free text, so the user can type a
// new one and it is stored as-is. Kept as plain English identifiers; the
// display layer can localize later if needed (out of scope for v1).

export const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Bills',
  'Shopping',
  'Health',
  'Entertainment'
];

export const INCOME_CATEGORIES = ['Salary', 'Bonus', 'Gift'];

export function categoriesFor(type: TransactionType): string[] {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}
