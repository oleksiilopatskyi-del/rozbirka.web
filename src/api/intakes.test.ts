import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { apiClient } from './client'
import { intakesApi } from './intakes'

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

describe('intakesApi', () => {
  it('passes the documented server search, status, and pagination query unchanged', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(
        response(config, {
          items: [],
          page: 3,
          pageSize: 10,
          total: 0,
          totalPages: 0,
        }),
      )
    }

    await intakesApi.list({
      search: 'supplier',
      status: 'closed',
      page: 3,
      pageSize: 10,
    })

    expect(request.url).toBe('/intakes')
    expect(request.params).toEqual({
      search: 'supplier',
      status: 'closed',
      page: 3,
      pageSize: 10,
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

    await intakesApi.list({
      status: 'archived' as never,
      page: 1,
      pageSize: 20,
    })

    expect(request.params).toEqual({ page: 1, pageSize: 20 })
  })

  it('creates an intake with only contract fields', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(response(config, { id: 'intake-1' }))
    }

    await intakesApi.create({
      name: 'Липнева партія',
      supplier: 'Постачальник',
      purchasedAt: '2026-08-01T12:00:00Z',
      totalCost: 5000,
      notes: 'Перевірити VIN',
      photoKeys: ['media/intake-1'],
      createdBy: 'user-2',
    } as never)

    expect(request.url).toBe('/intakes')
    expect(request.method).toBe('post')
    expect(JSON.parse(request.data as string)).toEqual({
      name: 'Липнева партія',
      supplier: 'Постачальник',
      purchasedAt: '2026-08-01T12:00:00Z',
      totalCost: 5000,
      notes: 'Перевірити VIN',
      photoKeys: ['media/intake-1'],
    })
  })

  it('posts every documented part field without truncating photo keys', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(response(config, { id: 'part-1' }))
    }
    const payload = {
      name: 'Бампер',
      partType: 'Кузов',
      condition: 'good',
      quantity: 2,
      unit: 'шт',
      notes: 'З подряпиною',
      photoKeys: [
        'part/1',
        'part/2',
        'part/3',
        'part/4',
        'part/5',
        'part/6',
        'part/7',
        'part/8',
      ],
      intakeId: 'other-intake',
    }

    await intakesApi.addPart('intake-1', payload)

    expect(request.url).toBe('/intakes/intake-1/parts')
    expect(JSON.parse(request.data as string)).toEqual({
      name: 'Бампер',
      partType: 'Кузов',
      condition: 'good',
      quantity: 2,
      unit: 'шт',
      notes: 'З подряпиною',
      photoKeys: [
        'part/1',
        'part/2',
        'part/3',
        'part/4',
        'part/5',
        'part/6',
        'part/7',
        'part/8',
      ],
    })
  })

  it('patches only documented intake update fields and never sends photo keys', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(response(config, { id: 'intake-1' }))
    }

    await intakesApi.update('intake-1', {
      name: 'Оновлене приймання',
      supplier: null,
      totalCost: 6500,
      notes: null,
      photoKeys: ['pending/intakes/unsafe'],
    } as never)

    expect(request.url).toBe('/intakes/intake-1')
    expect(request.method).toBe('patch')
    expect(JSON.parse(request.data as string)).toEqual({
      name: 'Оновлене приймання',
      supplier: null,
      totalCost: 6500,
      notes: null,
    })
  })
})
