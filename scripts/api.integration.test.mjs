import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nextBinary = path.join(projectRoot, 'node_modules/next/dist/bin/next')
let fixtureRoot
let fixtureProject
let server
let serverUrl
let serverOutput = ''
let adminCookie
let employeeCookie

async function availablePort() {
  const listener = net.createServer()
  await new Promise((resolve, reject) => listener.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()))
  const address = listener.address()
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function createIsolatedProject() {
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'med-easy-api-tests-'))
  fixtureProject = path.join(fixtureRoot, 'project')
  await mkdir(fixtureProject, { recursive: true })
  await cp(projectRoot, fixtureProject, {
    recursive: true,
    filter(source) {
      const relative = path.relative(projectRoot, source)
      if (!relative) return true
      const parts = relative.split(path.sep)
      if (parts.some((part) => ['node_modules', '.next', '.git', '.vercel', 'user_read_only_context'].includes(part))) return false
      if (parts[0] === 'data' && parts[1] === 'runtime') return false
      if (path.basename(source).startsWith('.env')) return false
      return true
    },
  })
  await symlink(path.join(projectRoot, 'node_modules'), path.join(fixtureProject, 'node_modules'), 'dir')
}

async function startServer() {
  await createIsolatedProject()
  const port = await availablePort()
  serverUrl = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, [nextBinary, 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: fixtureProject,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      MED_EASY_DATA_DIR: path.join(fixtureProject, 'data/runtime'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const captureOutput = (chunk) => {
    const combined = `${serverOutput}${chunk}`
    serverOutput = combined.length > 16_000 ? `${combined.slice(0, 8_000)}\n... output omitted ...\n${combined.slice(-8_000)}` : combined
  }
  server.stdout.setEncoding('utf8').on('data', captureOutput)
  server.stderr.setEncoding('utf8').on('data', captureOutput)

  const startedAt = Date.now()
  while (Date.now() - startedAt < 45_000) {
    if (server.exitCode !== null) throw new Error(`Next.js test server exited before becoming ready.\n${serverOutput}`)
    try {
      const response = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(1500) })
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Next.js test server did not become ready.\n${serverOutput}`)
}

async function stopServer() {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))])
    if (server.exitCode === null) {
      server.kill('SIGKILL')
      await once(server, 'exit')
    }
  }
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true })
}

async function api(pathname, { method = 'GET', cookie, body, headers: extraHeaders = {} } = {}) {
  const headers = new Headers(extraHeaders)
  if (cookie) headers.set('cookie', cookie)
  if (body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(`${serverUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const result = response.status === 204 ? null : await response.json()
  return { response, result, data: result?.data }
}

function sessionCookie(response) {
  const value = response.headers.get('set-cookie')
  assert.ok(value, 'authentication response should set a session cookie')
  return value.split(';', 1)[0]
}

async function createAdjustment(cookie, body, key) {
  return api('/api/v1/stock-adjustments', {
    method: 'POST',
    cookie,
    headers: { 'Idempotency-Key': key },
    body,
  })
}

before(startServer, { timeout: 120_000 })
after(() => stopServer(), { timeout: 15_000 })

test('JSON-backed API integration: auth, master data, and inventory', async (t) => {
  const unauthenticated = await api('/api/v1/categories')
  assert.equal(unauthenticated.response.status, 401)
  assert.equal(unauthenticated.result.code, 'UNAUTHORIZED')

  const adminSignUp = await api('/api/auth/sign-up/email', {
    method: 'POST',
    body: { email: 'aarav.admin@example.test', password: 'Phase Four Admin Password 2026' },
  })
  assert.equal(adminSignUp.response.status, 201)
  adminCookie = sessionCookie(adminSignUp.response)
  assert.equal(adminSignUp.data.user.role, 'admin')

  const adminUsers = await api('/api/v1/users', { cookie: adminCookie })
  assert.equal(adminUsers.response.status, 200)
  assert.ok(adminUsers.data.items.some((user) => user.email === 'aarav.admin@example.test'))

  const stamp = `${Date.now()}-${process.pid}`
  const employeeCreated = await api('/api/v1/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'Phase Four Cashier', email: 'phase-four-cashier@example.test', role: 'cashier', status: 'active' },
  })
  assert.equal(employeeCreated.response.status, 201)
  assert.equal(employeeCreated.data.user.role, 'cashier')
  const employeeSignUp = await api('/api/auth/sign-up/email', {
    method: 'POST',
    body: {
      email: employeeCreated.data.user.email,
      password: 'Phase Four Employee Password 2026',
      verificationToken: employeeCreated.data.accountSetupToken,
    },
  })
  assert.equal(employeeSignUp.response.status, 201)
  employeeCookie = sessionCookie(employeeSignUp.response)

  await t.test('enforces admin and employee authorization', async () => {
    const employeeSession = await api('/api/auth/get-session', { cookie: employeeCookie })
    assert.equal(employeeSession.data.user.role, 'cashier')
    assert.equal((await api('/api/v1/inventory', { cookie: employeeCookie })).response.status, 200)
    const usersDenied = await api('/api/v1/users', { cookie: employeeCookie })
    assert.equal(usersDenied.response.status, 403)
    assert.equal(usersDenied.result.code, 'FORBIDDEN')
    assert.equal((await api('/api/v1/reports?type=sales', { cookie: employeeCookie })).response.status, 403)
    assert.equal((await api('/api/v1/settings', { cookie: employeeCookie })).response.status, 403)
    const masterDataWriteDenied = await api('/api/v1/categories', {
      method: 'POST', cookie: employeeCookie, body: { name: `Denied ${stamp}`, description: 'Denied', status: 'active' },
    })
    assert.equal(masterDataWriteDenied.response.status, 403)
    const adjustmentDenied = await createAdjustment(employeeCookie, {
      reason: 'Employee must not adjust stock', lines: [{ batchId: 'bat_001', quantityDelta: 1 }],
    }, `employee-${stamp}`)
    assert.equal(adjustmentDenied.response.status, 403)

    const deactivatedEmployee = await api(`/api/v1/users/${employeeCreated.data.user.id}`, {
      method: 'PATCH', cookie: adminCookie, body: { status: 'inactive' },
    })
    assert.equal(deactivatedEmployee.response.status, 200)
    const inactiveDashboard = await api('/api/v1/dashboard', { cookie: employeeCookie })
    assert.equal(inactiveDashboard.response.status, 403)
    assert.equal(inactiveDashboard.result.code, 'FORBIDDEN')
  })

  let categoryId
  let unitId
  let medicineId
  let supplierId
  let batchId
  const categoryName = `Phase Four ${stamp}`
  const unitName = `QA unit ${stamp}`

  await t.test('covers master-data CRUD, duplicates, and reference validation', async () => {
    const createdCategory = await api('/api/v1/categories', {
      method: 'POST', cookie: adminCookie, body: { name: categoryName, description: 'Initial description', status: 'active' },
    })
    assert.equal(createdCategory.response.status, 201)
    categoryId = createdCategory.data.id
    const categoryList = await api(`/api/v1/categories?q=${encodeURIComponent(categoryName)}`, { cookie: adminCookie })
    assert.equal(categoryList.response.status, 200)
    assert.ok(categoryList.data.items.some((item) => item.id === categoryId))

    const duplicateCategory = await api('/api/v1/categories', {
      method: 'POST', cookie: adminCookie, body: { name: categoryName.toLowerCase(), description: 'Duplicate', status: 'active' },
    })
    assert.equal(duplicateCategory.response.status, 409)
    assert.equal(duplicateCategory.result.code, 'CONFLICT')

    const updatedCategory = await api(`/api/v1/categories/${categoryId}`, {
      method: 'PATCH', cookie: adminCookie, body: { description: 'Updated by API integration test' },
    })
    assert.equal(updatedCategory.response.status, 200)
    assert.equal(updatedCategory.data.description, 'Updated by API integration test')

    const createdUnit = await api('/api/v1/units', {
      method: 'POST', cookie: adminCookie, body: { name: unitName, code: `QA-${stamp}`, description: 'API test unit', status: 'active' },
    })
    assert.equal(createdUnit.response.status, 201)
    unitId = createdUnit.data.id

    const invalidMedicine = await api('/api/v1/medicines', {
      method: 'POST', cookie: adminCookie,
      body: {
        sku: `INVALID-${stamp}`, name: 'Invalid reference medicine', genericName: 'Invalid reference',
        categoryId: 'cat_missing', unitId, manufacturer: 'Test', purchasePricePaise: 100,
        sellingPricePaise: 150, gstRateBps: 500, reorderLevel: 5, requiresPrescription: false, status: 'active',
      },
    })
    assert.equal(invalidMedicine.response.status, 422)
    assert.equal(invalidMedicine.result.code, 'VALIDATION_ERROR')
    assert.match(invalidMedicine.result.message, /categoryId/)

    const sku = `PH4-${stamp}`
    const createdMedicine = await api('/api/v1/medicines', {
      method: 'POST', cookie: adminCookie,
      body: {
        sku, name: `Inventory QA medicine ${stamp}`, genericName: 'Inventory QA compound', categoryId, unitId,
        manufacturer: 'Med Easy QA', purchasePricePaise: 1000, sellingPricePaise: 1500,
        gstRateBps: 500, reorderLevel: 5, requiresPrescription: false, status: 'active',
      },
    })
    assert.equal(createdMedicine.response.status, 201)
    medicineId = createdMedicine.data.id
    const medicineSearch = await api(`/api/v1/medicines?q=${encodeURIComponent(sku)}&categoryId=${categoryId}&status=active`, { cookie: adminCookie })
    assert.equal(medicineSearch.response.status, 200)
    assert.deepEqual(medicineSearch.data.items.map((item) => item.id), [medicineId])

    const duplicateMedicine = await api('/api/v1/medicines', {
      method: 'POST', cookie: adminCookie,
      body: {
        sku, name: `Duplicate medicine ${stamp}`, genericName: 'Duplicate', categoryId, unitId,
        manufacturer: 'Med Easy QA', purchasePricePaise: 1000, sellingPricePaise: 1500,
        gstRateBps: 500, reorderLevel: 5, requiresPrescription: false, status: 'active',
      },
    })
    assert.equal(duplicateMedicine.response.status, 409)

    const gstinSuffix = String(Date.now() % 10000).padStart(4, '0')
    const createdSupplier = await api('/api/v1/suppliers', {
      method: 'POST', cookie: adminCookie,
      body: {
        name: `QA supplier ${stamp}`, contactName: 'Test Contact', phone: '9876500001',
        email: `supplier-${stamp}@example.test`, gstin: `29ABCDE${gstinSuffix}F1Z5`,
        address: '1 Test Street', city: 'Mumbai', status: 'active',
      },
    })
    assert.equal(createdSupplier.response.status, 201)
    supplierId = createdSupplier.data.id

    const deactivated = await api(`/api/v1/categories/${categoryId}`, { method: 'DELETE', cookie: adminCookie })
    assert.equal(deactivated.response.status, 204)
    const afterDeactivation = await api(`/api/v1/categories/${categoryId}`, { cookie: adminCookie })
    assert.equal(afterDeactivation.data.status, 'inactive')
  })

  await t.test('covers batch CRUD, inventory summaries, and stock status precedence', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const summaryBeforeBatch = (await api('/api/v1/inventory?view=current&page=1&pageSize=100', { cookie: adminCookie })).data.summary
    const batchBody = {
      batchNumber: `PH4-B-${stamp}`, medicineId, supplierId, receivedOn: today, expiryDate: '2099-12-31',
      openingQuantity: 0, reorderLevel: 5, purchasePricePaise: 1000, sellingPricePaise: 1500,
    }
    const createdBatch = await api('/api/v1/batches', { method: 'POST', cookie: adminCookie, body: batchBody })
    assert.equal(createdBatch.response.status, 201)
    batchId = createdBatch.data.id
    const batchView = await api(`/api/v1/batches?medicineId=${medicineId}&page=1&pageSize=100`, { cookie: adminCookie })
    assert.equal(batchView.response.status, 200)
    assert.ok(batchView.data.items.some((batch) => batch.id === batchId))

    const duplicateBatch = await api('/api/v1/batches', { method: 'POST', cookie: adminCookie, body: batchBody })
    assert.equal(duplicateBatch.response.status, 409)

    const updatedBatch = await api(`/api/v1/batches/${batchId}`, {
      method: 'PATCH', cookie: adminCookie, body: { sellingPricePaise: 1750 },
    })
    assert.equal(updatedBatch.response.status, 200)
    assert.equal(updatedBatch.data.sellingPricePaise, 1750)

    const inventoryUrl = `/api/v1/inventory?view=current&medicineId=${medicineId}&page=1&pageSize=100`
    const emptyStock = await api(inventoryUrl, { cookie: adminCookie })
    assert.equal(emptyStock.response.status, 200)
    assert.equal(emptyStock.data.items.find((row) => row.batchId === batchId).status, 'Out of stock')
    assert.equal(emptyStock.data.summary.batchCount, summaryBeforeBatch.batchCount + 1)
    assert.equal(emptyStock.data.summary.unitsOnHand, summaryBeforeBatch.unitsOnHand)
    assert.equal(emptyStock.data.summary.stockValuePaise, summaryBeforeBatch.stockValuePaise)
    assert.equal(typeof emptyStock.data.summary.lowStockMedicineCount, 'number')

    const lowStockAdjustment = {
      reason: 'Phase four low stock check', adjustedOn: today,
      lines: [{ batchId, quantityDelta: 3 }],
    }
    const missingKey = await api('/api/v1/stock-adjustments', { method: 'POST', cookie: adminCookie, body: lowStockAdjustment })
    assert.equal(missingKey.response.status, 400)
    assert.equal(missingKey.result.code, 'INVALID_REQUEST')

    const first = await createAdjustment(adminCookie, lowStockAdjustment, `same-request-${stamp}`)
    assert.equal(first.response.status, 201)
    assert.equal(first.data.adjustment.lines[0].quantityDelta, 3)
    assert.equal(first.data.movements.length, 1)

    const replay = await createAdjustment(adminCookie, lowStockAdjustment, `same-request-${stamp}`)
    assert.equal(replay.response.status, 201)
    assert.deepEqual(replay.data, first.data)
    const lowStock = await api(inventoryUrl, { cookie: adminCookie })
    assert.equal(lowStock.data.items.find((row) => row.batchId === batchId).quantityOnHand, 3)
    assert.equal(lowStock.data.items.find((row) => row.batchId === batchId).status, 'Low stock')

    const changedPayload = await createAdjustment(adminCookie, {
      ...lowStockAdjustment, lines: [{ batchId, quantityDelta: 4 }],
    }, `same-request-${stamp}`)
    assert.equal(changedPayload.response.status, 409)

    const concurrentBody = { reason: 'Phase four concurrency check', adjustedOn: today, lines: [{ batchId, quantityDelta: 1 }] }
    const [concurrentFirst, concurrentRetry] = await Promise.all([
      createAdjustment(adminCookie, concurrentBody, `concurrent-${stamp}`),
      createAdjustment(adminCookie, concurrentBody, `concurrent-${stamp}`),
    ])
    assert.equal(concurrentFirst.response.status, 201)
    assert.equal(concurrentRetry.response.status, 201)
    assert.equal(concurrentFirst.data.adjustment.id, concurrentRetry.data.adjustment.id)

    const negativeStock = await createAdjustment(adminCookie, {
      reason: 'Reject negative stock test', adjustedOn: today, lines: [{ batchId, quantityDelta: -100 }],
    }, `negative-stock-${stamp}`)
    assert.equal(negativeStock.response.status, 409)

    const inStockAdjustment = await createAdjustment(adminCookie, {
      reason: 'Phase four in stock check', adjustedOn: today, lines: [{ batchId, quantityDelta: 2 }],
    }, `in-stock-${stamp}`)
    assert.equal(inStockAdjustment.response.status, 201)
    const inStock = await api(inventoryUrl, { cookie: adminCookie })
    assert.equal(inStock.data.items.find((row) => row.batchId === batchId).quantityOnHand, 6)
    assert.equal(inStock.data.items.find((row) => row.batchId === batchId).status, 'In stock')
    assert.equal(inStock.data.summary.unitsOnHand, summaryBeforeBatch.unitsOnHand + 6)
    assert.equal(inStock.data.summary.stockValuePaise, summaryBeforeBatch.stockValuePaise + 6000)
    assert.equal(inStock.data.summary.lowStockMedicineCount, summaryBeforeBatch.lowStockMedicineCount - 1)

    const lowStockView = await api(`/api/v1/inventory?view=low-stock&medicineId=${medicineId}`, { cookie: adminCookie })
    assert.equal(lowStockView.response.status, 200)
    assert.ok(!lowStockView.data.items.some((row) => row.batchId === batchId))

    const batchMovements = await api(`/api/v1/stock-movements?batchId=${batchId}&page=1&pageSize=100`, { cookie: adminCookie })
    assert.equal(batchMovements.response.status, 200)
    assert.equal(batchMovements.data.items.filter((movement) => movement.movementType === 'adjustment').length, 3)
    const adjustmentList = await api('/api/v1/stock-adjustments?page=1&pageSize=100', { cookie: adminCookie })
    const visibleAdjustment = adjustmentList.data.items.find((item) => item.id === first.data.adjustment.id)
    assert.ok(visibleAdjustment)
    assert.equal('idempotencyKey' in visibleAdjustment, false)
    assert.equal('requestHash' in visibleAdjustment, false)
    assert.equal('resultMovements' in visibleAdjustment, false)

    const detail = await api(`/api/v1/inventory/${medicineId}`, { cookie: adminCookie })
    assert.equal(detail.response.status, 200)
    assert.equal(detail.data.batches.find((row) => row.batchId === batchId).quantityOnHand, 6)
    assert.equal(detail.data.movements.filter((movement) => movement.batchId === batchId && movement.movementType === 'adjustment').length, 3)
  })

  await t.test('covers purchase receipt, POS, payment allocations, quotations, expenses, and cash book', async () => {
    const initialDashboard = await api('/api/v1/dashboard?range=week', { cookie: adminCookie })
    assert.equal(initialDashboard.response.status, 200)
    const today = initialDashboard.data.date
    const inventoryUrl = `/api/v1/inventory?view=current&medicineId=${medicineId}&page=1&pageSize=100`
    const onHand = async () => (await api(inventoryUrl, { cookie: adminCookie })).data.items.reduce((sum, row) => sum + row.quantityOnHand, 0)
    const purchaseInput = {
      supplierId, purchasedOn: today, supplierInvoiceNumber: `SUP-${stamp}`,
      lines: [{ medicineId, quantity: 20, unitPricePaise: 1000, discountPaise: 0, batchNumber: `PH5-${stamp}`, expiryDate: '2099-12-31', reorderLevel: 5, sellingPricePaise: 1500 }],
    }
    const stockBeforePurchase = await onHand()
    const purchaseKey = `purchase-draft-${stamp}`
    const [purchaseCreated, purchaseRetry] = await Promise.all([
      api('/api/v1/purchases', { method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': purchaseKey }, body: purchaseInput }),
      api('/api/v1/purchases', { method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': purchaseKey }, body: purchaseInput }),
    ])
    assert.equal(purchaseCreated.response.status, 201)
    assert.equal(purchaseRetry.response.status, 201)
    assert.equal(purchaseCreated.data.purchase.id, purchaseRetry.data.purchase.id)
    assert.equal(purchaseCreated.data.purchase.status, 'draft')
    assert.equal(await onHand(), stockBeforePurchase, 'draft purchases do not add stock')

    const purchaseId = purchaseCreated.data.purchase.id
    const purchaseReceived = await api(`/api/v1/purchases/${purchaseId}/receive`, {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': `receive-${stamp}` }, body: {},
    })
    assert.equal(purchaseReceived.response.status, 200)
    assert.equal(purchaseReceived.data.purchase.status, 'received')
    const receivedBatchId = purchaseReceived.data.items[0].batchId
    assert.ok(receivedBatchId)
    assert.equal(await onHand(), stockBeforePurchase + 20)
    const receiveRetry = await api(`/api/v1/purchases/${purchaseId}/receive`, {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': `receive-${stamp}` }, body: {},
    })
    assert.equal(receiveRetry.response.status, 200)
    assert.equal((await onHand()), stockBeforePurchase + 20, 'receiving a purchase retry does not add stock twice')
    const purchaseMovements = await api(`/api/v1/stock-movements?sourceId=${purchaseId}&page=1&pageSize=100`, { cookie: adminCookie })
    assert.equal(purchaseMovements.data.items.filter((movement) => movement.movementType === 'purchase_receipt').length, 1)

    const supplierPaymentInput = {
      transactionType: 'purchase', transactionId: purchaseId, amountPaise: 10000,
      method: 'upi', reference: `SUP-PAY-${stamp}`, paidOn: today,
    }
    const supplierPayment = await api('/api/v1/payments', {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': `supplier-payment-${stamp}` }, body: supplierPaymentInput,
    })
    assert.equal(supplierPayment.response.status, 201)
    const supplierPaymentRetry = await api('/api/v1/payments', {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': `supplier-payment-${stamp}` }, body: supplierPaymentInput,
    })
    assert.equal(supplierPaymentRetry.data.id, supplierPayment.data.id)
    const purchaseAfterPayment = await api(`/api/v1/purchases/${purchaseId}`, { cookie: adminCookie })
    assert.equal(purchaseAfterPayment.data.purchase.paidPaise, 10000)
    assert.equal((await api('/api/v1/payments/summary', { cookie: adminCookie })).response.status, 200)

    const stockBeforeSale = await onHand()
    const saleInput = {
      patientId: 'pat_001', doctorId: null, soldOn: today, settlementMethod: 'cash',
      lines: [{ medicineId, quantity: 3, discountPaise: 0 }],
    }
    const saleKey = `sale-draft-${stamp}`
    const [saleCreated, saleRetry] = await Promise.all([
      api('/api/v1/sales', { method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': saleKey }, body: saleInput }),
      api('/api/v1/sales', { method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': saleKey }, body: saleInput }),
    ])
    assert.equal(saleCreated.response.status, 201)
    assert.equal(saleCreated.data.sale.status, 'draft')
    assert.equal(saleCreated.data.sale.id, saleRetry.data.sale.id)
    assert.equal(await onHand(), stockBeforeSale, 'draft sales do not deduct stock')

    const saleId = saleCreated.data.sale.id
    const saleCompletion = { payment: { amountPaise: 1000, method: 'cash', reference: `POS-${stamp}` } }
    const completionKey = `complete-sale-${stamp}`
    const saleCompleted = await api(`/api/v1/sales/${saleId}/complete`, {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': completionKey }, body: saleCompletion,
    })
    assert.equal(saleCompleted.response.status, 200)
    assert.equal(saleCompleted.data.sale.status, 'partially_paid')
    const completionRetry = await api(`/api/v1/sales/${saleId}/complete`, {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': completionKey }, body: saleCompletion,
    })
    assert.equal(completionRetry.response.status, 200)
    assert.equal(await onHand(), stockBeforeSale - 3, 'sale completion retry deducts stock once')
    const saleMovements = await api(`/api/v1/stock-movements?sourceId=${saleId}&page=1&pageSize=100`, { cookie: adminCookie })
    assert.equal(saleMovements.data.items.filter((movement) => movement.movementType === 'sale').reduce((sum, movement) => sum - movement.quantityDelta, 0), 3)

    const saleDetail = await api(`/api/v1/sales/${saleId}`, { cookie: adminCookie })
    const remainingPaise = saleDetail.data.sale.totalPaise - saleDetail.data.sale.paidPaise
    const balancePaymentInput = {
      transactionType: 'sale', transactionId: saleId, amountPaise: remainingPaise,
      method: 'bank_transfer', reference: `FINAL-${stamp}`, paidOn: today,
    }
    const balancePayment = await api('/api/v1/payments', {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': `balance-payment-${stamp}` }, body: balancePaymentInput,
    })
    assert.equal(balancePayment.response.status, 201)
    const balancePaymentRetry = await api('/api/v1/payments', {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': `balance-payment-${stamp}` }, body: balancePaymentInput,
    })
    assert.equal(balancePaymentRetry.data.id, balancePayment.data.id)
    const settledSale = await api(`/api/v1/sales/${saleId}`, { cookie: adminCookie })
    assert.equal(settledSale.data.sale.paidPaise, settledSale.data.sale.totalPaise)
    assert.equal(settledSale.data.sale.status, 'completed')
    const overpayment = await api('/api/v1/payments', {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': `overpayment-${stamp}` },
      body: { ...balancePaymentInput, amountPaise: 1 },
    })
    assert.equal(overpayment.response.status, 409)

    const paymentCountBeforeQuote = (await api('/api/v1/payments?page=1&pageSize=100', { cookie: adminCookie })).data.items.length
    const cashEntryCountBeforeQuote = (await api('/api/v1/cash-book', { cookie: adminCookie })).data.summary.entryCount
    const quotationInput = {
      patientId: 'pat_001', issuedOn: today, validUntil: '2099-12-31',
      lines: [{ medicineId, quantity: 2, discountPaise: 0 }],
    }
    const quotation = await api('/api/v1/quotations', {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': `quotation-${stamp}` }, body: quotationInput,
    })
    assert.equal(quotation.response.status, 201)
    const stockBeforeConversion = await onHand()
    const conversionKey = `quotation-convert-${stamp}`
    const convertedSale = await api(`/api/v1/quotations/${quotation.data.quotation.id}/convert-to-sale`, {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': conversionKey }, body: {},
    })
    assert.equal(convertedSale.response.status, 201)
    assert.equal(convertedSale.data.sale.status, 'draft')
    assert.equal(convertedSale.data.sale.sourceQuotationId, quotation.data.quotation.id)
    const conversionRetry = await api(`/api/v1/quotations/${quotation.data.quotation.id}/convert-to-sale`, {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': conversionKey }, body: {},
    })
    assert.equal(conversionRetry.data.sale.id, convertedSale.data.sale.id)
    assert.equal(await onHand(), stockBeforeConversion, 'quotation conversion does not deduct stock')
    assert.equal((await api('/api/v1/payments?page=1&pageSize=100', { cookie: adminCookie })).data.items.length, paymentCountBeforeQuote)
    assert.equal((await api('/api/v1/cash-book', { cookie: adminCookie })).data.summary.entryCount, cashEntryCountBeforeQuote)

    const convertedCompletion = await api(`/api/v1/sales/${convertedSale.data.sale.id}/complete`, {
      method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': `complete-converted-${stamp}` }, body: { payment: { amountPaise: 0, method: 'credit' } },
    })
    assert.equal(convertedCompletion.response.status, 200)
    assert.equal(await onHand(), stockBeforeConversion - 2)
    const quoteAfterConversion = await api(`/api/v1/quotations/${quotation.data.quotation.id}`, { cookie: adminCookie })
    assert.equal(quoteAfterConversion.data.quotation.status, 'converted')
    assert.equal(quoteAfterConversion.data.quotation.convertedSaleId, convertedSale.data.sale.id)

    const expenseInput = {
      category: 'supplies', description: 'POS workflow supplies', incurredOn: today, amountPaise: 1234,
      method: 'cash', reference: `EXP-${stamp}`, notes: 'Workflow test', paidInCash: true,
    }
    const expenseKey = `expense-${stamp}`
    const expense = await api('/api/v1/expenses', { method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': expenseKey }, body: expenseInput })
    assert.equal(expense.response.status, 201)
    const expenseRetry = await api('/api/v1/expenses', { method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': expenseKey }, body: expenseInput })
    assert.equal(expenseRetry.data.id, expense.data.id)
    const updatedExpenseInput = { ...expenseInput, amountPaise: 1500, description: 'Updated POS supplies' }
    const updatedExpense = await api(`/api/v1/expenses/${expense.data.id}`, {
      method: 'PATCH', cookie: adminCookie, headers: { 'Idempotency-Key': `expense-edit-${stamp}` }, body: updatedExpenseInput,
    })
    assert.equal(updatedExpense.response.status, 200)
    const expenseHistory = (await api('/api/v1/cash-book', { cookie: adminCookie })).data.items.filter((entry) => entry.expenseId === expense.data.id)
    assert.equal(expenseHistory.reduce((sum, entry) => sum + (entry.entryType === 'inflow' ? entry.amountPaise : -entry.amountPaise), 0), -1500)

    const manualInput = { entryType: 'inflow', amountPaise: 500, occurredOn: today, description: 'Opening float correction', reference: `MAN-${stamp}` }
    const manualKey = `manual-${stamp}`
    const manual = await api('/api/v1/cash-book', { method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': manualKey }, body: manualInput })
    assert.equal(manual.response.status, 201)
    const manualRetry = await api('/api/v1/cash-book', { method: 'POST', cookie: adminCookie, headers: { 'Idempotency-Key': manualKey }, body: manualInput })
    assert.equal(manualRetry.data.id, manual.data.id)
    assert.equal((await api('/api/v1/cash-book/summary', { cookie: adminCookie })).response.status, 200)

    const dashboard = await api('/api/v1/dashboard?range=week', { cookie: adminCookie })
    assert.equal(dashboard.response.status, 200)
    assert.equal(dashboard.data.date, today)
    assert.ok(dashboard.data.recentSales.some((sale) => sale.id === saleId))
    assert.ok(dashboard.data.recentPurchases.some((entry) => entry.id === purchaseId))
    assert.ok(dashboard.data.stats.salesTodayPaise >= settledSale.data.sale.totalPaise)
    assert.ok(dashboard.data.stats.purchasesTodayPaise >= purchaseReceived.data.purchase.totalPaise)

    const reportQuery = (type, filters = {}) => new URLSearchParams({ type, from: today, to: today, ...filters }).toString()
    const salesReport = await api(`/api/v1/reports?${reportQuery('sales', { patientId: 'pat_001' })}`, { cookie: adminCookie })
    assert.equal(salesReport.response.status, 200)
    const saleReportRow = salesReport.data.items.find((row) => row.invoiceNumber === settledSale.data.sale.invoiceNumber)
    assert.ok(saleReportRow)
    assert.equal(saleReportRow.totalPaise, settledSale.data.sale.totalPaise)

    const purchaseReport = await api(`/api/v1/reports?${reportQuery('purchases', { supplierId })}`, { cookie: adminCookie })
    assert.equal(purchaseReport.response.status, 200)
    assert.ok(purchaseReport.data.items.some((row) => row.invoiceNumber === purchaseReceived.data.purchase.invoiceNumber))

    const profitReport = await api(`/api/v1/reports?${reportQuery('profit', { patientId: 'pat_001' })}`, { cookie: adminCookie })
    assert.equal(profitReport.response.status, 200)
    const profitRow = profitReport.data.items.find((row) => row.invoiceNumber === settledSale.data.sale.invoiceNumber)
    assert.ok(profitRow)
    assert.ok(profitRow.costOfGoodsSoldPaise > 0)
    assert.equal(profitRow.grossProfitPaise, profitRow.salesRevenuePaise - profitRow.costOfGoodsSoldPaise)
    assert.equal(profitReport.data.methodology.includes('GST collected'), true)

    const expenseReport = await api(`/api/v1/reports?${reportQuery('expenses', { q: expense.data.reference })}`, { cookie: adminCookie })
    assert.equal(expenseReport.response.status, 200)
    assert.ok(expenseReport.data.items.some((row) => row.reference === expense.data.reference && row.amountPaise === 1500))

    const paymentsReport = await api(`/api/v1/reports?${reportQuery('payments', { q: balancePayment.data.reference })}`, { cookie: adminCookie })
    assert.equal(paymentsReport.response.status, 200)
    assert.ok(paymentsReport.data.items.some((row) => row.reference === balancePayment.data.reference))

    const stockReport = await api(`/api/v1/reports?${reportQuery('stock', { medicineId })}`, { cookie: adminCookie })
    assert.equal(stockReport.response.status, 200)
    assert.ok(stockReport.data.items.some((row) => row.medicineId === medicineId && row.quantityOnHand > 0))

    const expiryReport = await api(`/api/v1/reports?${reportQuery('expiry', { medicineId, from: today, to: '2099-12-31' })}`, { cookie: adminCookie })
    assert.equal(expiryReport.response.status, 200)
    assert.ok(expiryReport.data.items.some((row) => row.medicineId === medicineId))

    const taxReport = await api(`/api/v1/reports?${reportQuery('tax', { transactionType: 'sale', rateBps: '500' })}`, { cookie: adminCookie })
    assert.equal(taxReport.response.status, 200)
    assert.ok(taxReport.data.items.some((row) => row.invoiceNumber === settledSale.data.sale.invoiceNumber))

    const csvResponse = await fetch(`${serverUrl}/api/v1/reports?${reportQuery('sales', { patientId: 'pat_001' })}&format=csv`, { headers: { cookie: adminCookie } })
    assert.equal(csvResponse.status, 200)
    assert.match(await csvResponse.text(), /invoiceNumber/)

    const settings = await api('/api/v1/settings', { cookie: adminCookie })
    const preferences = await api('/api/v1/preferences', { cookie: adminCookie })
    assert.equal(settings.response.status, 200)
    assert.equal(preferences.response.status, 200)
    const updatedRange = preferences.data.dashboardRange === 'month' ? 'year' : 'month'
    const changedPreferences = await api('/api/v1/preferences', { method: 'PATCH', cookie: adminCookie, body: { timezone: preferences.data.timezone, dateFormat: preferences.data.dateFormat, dashboardRange: updatedRange } })
    assert.equal(changedPreferences.response.status, 200)
    assert.equal(changedPreferences.data.dashboardRange, updatedRange)
    const originalExpiryDays = settings.data.inventory.nearExpiryDays
    const changedExpiryDays = originalExpiryDays === 365 ? 364 : originalExpiryDays + 1
    const changedSettings = await api('/api/v1/settings/inventory', { method: 'PATCH', cookie: adminCookie, body: { lowStockAlertsEnabled: settings.data.inventory.lowStockAlertsEnabled, nearExpiryAlertsEnabled: settings.data.inventory.nearExpiryAlertsEnabled, nearExpiryDays: changedExpiryDays } })
    assert.equal(changedSettings.response.status, 200)
    assert.equal(changedSettings.data.nearExpiryDays, changedExpiryDays)
  })
})
