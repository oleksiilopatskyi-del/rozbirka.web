import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { apiClient } from './client'
import { carsApi } from './cars'

const originalAdapter = apiClient.defaults.adapter!

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
})

function response<T>(
  config: InternalAxiosRequestConfig,
  data: T,
): AxiosResponse<{ data: T }> {
  return {
    data: { data },
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
  }
}

describe('carsApi', () => {
  it('sends the OpenAPI list filters without deriving financial values locally', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(
        response(config, {
          items: [],
          page: 2,
          pageSize: 25,
          total: 0,
          totalPages: 0,
        }),
      )
    }

    await carsApi.list({
      search: 'vin-001',
      status: 'active',
      page: 2,
      pageSize: 25,
    })

    expect(request.url).toBe('/cars')
    expect(request.params).toEqual({
      search: 'vin-001',
      status: 'active',
      page: 2,
      pageSize: 25,
    })
  })

  it('omits an unrecognized runtime status instead of sending it to Core', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(
        response(config, {
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        }),
      )
    }

    await carsApi.list({ status: 'deleted' as never, page: 1, pageSize: 20 })

    expect(request.params).toEqual({ page: 1, pageSize: 20 })
  })

  it('sends only the documented car create fields', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(response(config, { id: 'car-1' }))
    }

    await carsApi.create({
      code: 'CAR-001',
      brand: 'BMW',
      model: 'X5',
      year: 2020,
      purchasePrice: 12000,
      vin: 'WBAXX11010A123456',
      photoKeys: ['media/car-1'],
      status: 'archived',
    } as never)

    expect(request.url).toBe('/cars')
    expect(request.method).toBe('post')
    expect(JSON.parse(request.data as string)).toEqual({
      code: 'CAR-001',
      brand: 'BMW',
      model: 'X5',
      year: 2020,
      purchasePrice: 12000,
      vin: 'WBAXX11010A123456',
      photoKeys: ['media/car-1'],
    })
  })

  it('uses the documented expense endpoint and returns the server expense', async () => {
    let request!: InternalAxiosRequestConfig
    const expense = {
      id: 'expense-1',
      name: 'Transport',
      amount: 500,
      createdAt: '2026-08-28T10:00:00Z',
    }
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(response(config, expense))
    }

    await expect(
      carsApi.createExpense('car-1', { name: 'Transport', amount: 500 }),
    ).resolves.toEqual(expense)
    expect(request.url).toBe('/cars/car-1/expenses')
    expect(request.method).toBe('post')
  })

  it('updates an expense with the documented PUT payload', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(
        response(config, {
          id: 'expense-1',
          name: 'Доставка',
          amount: 750,
          createdAt: '2026-08-28T10:00:00Z',
        }),
      )
    }

    await carsApi.updateExpense('car-1', 'expense-1', {
      name: 'Доставка',
      amount: 750,
    })

    expect(request.url).toBe('/cars/car-1/expenses/expense-1')
    expect(request.method).toBe('put')
    expect(JSON.parse(request.data as string)).toEqual({
      name: 'Доставка',
      amount: 750,
    })
  })

  it('strips runtime-only media fields from the documented car update payload', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(response(config, { id: 'car-1' }))
    }

    await carsApi.update('car-1', {
      code: 'CAR-002',
      notes: null,
      photoKeys: ['pending/cars/unsafe'],
    } as never)

    expect(JSON.parse(request.data as string)).toEqual({
      code: 'CAR-002',
      notes: null,
    })
  })
})
