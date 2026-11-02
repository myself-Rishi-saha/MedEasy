import { calculateLineTotalPaise } from '@/lib/domain/server-utils'
import type { Medicine } from '@/lib/domain/types'

export interface DraftLine {
  medicine: Medicine
  quantity: number
  unitPricePaise: number
  discountPaise?: number
}

export function calculateTransaction(lines: DraftLine[]) {
  if (lines.length === 0) throw new Error('A transaction must contain at least one line')
  const calculatedLines = lines.map(({ medicine, quantity, unitPricePaise, discountPaise = 0 }) => ({
    medicineId: medicine.id,
    quantity,
    unitPricePaise,
    discountPaise,
    gstRateBps: medicine.gstRateBps,
    ...calculateLineTotalPaise(quantity, unitPricePaise, discountPaise, medicine.gstRateBps),
  }))
  const subtotalPaise = calculatedLines.reduce((total, line) => total + line.taxablePaise, 0)
  const taxPaise = calculatedLines.reduce((total, line) => total + line.taxPaise, 0)
  return { lines: calculatedLines, subtotalPaise, discountPaise: lines.reduce((total, line) => total + (line.discountPaise ?? 0), 0), taxPaise, totalPaise: subtotalPaise + taxPaise }
}
