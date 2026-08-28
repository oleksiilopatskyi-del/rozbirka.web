import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { apiClient } from './client'
import { teamApi } from './team'

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

describe('teamApi', () => {
  it('loads members, roles, invitations, and user permissions with cancellable requests', async () => {
    const controller = new AbortController()
    const requests: InternalAxiosRequestConfig[] = []
    apiClient.defaults.adapter = (config) => {
      requests.push(config)
      return Promise.resolve(response(config, []))
    }

    await teamApi.listMembers({ signal: controller.signal })
    await teamApi.listRoles({ signal: controller.signal })
    await teamApi.listInvitations({ signal: controller.signal })
    await teamApi.getUserPermissions('user/a', { signal: controller.signal })

    expect(requests.map((request) => request.url)).toEqual([
      '/team/members',
      '/team/roles',
      '/team/invitations',
      '/team/users/user%2Fa/permissions',
    ])
    expect(requests.map((request) => request.method)).toEqual([
      'get',
      'get',
      'get',
      'get',
    ])
    expect(requests.every((request) => request.signal?.aborted === false)).toBe(
      true,
    )

    controller.abort()

    expect(requests.every((request) => request.signal?.aborted === true)).toBe(
      true,
    )
  })

  it('loads encoded member and role details with cancellation', async () => {
    const controller = new AbortController()
    const requests: InternalAxiosRequestConfig[] = []
    apiClient.defaults.adapter = (config) => {
      requests.push(config)
      return Promise.resolve(response(config, {}))
    }

    await teamApi.getMember('member/a', { signal: controller.signal })
    await teamApi.getRole('role/a', { signal: controller.signal })

    expect(requests.map((request) => request.url)).toEqual([
      '/team/members/member%2Fa',
      '/team/roles/role%2Fa',
    ])
    controller.abort()
    expect(requests.every((request) => request.signal?.aborted)).toBe(true)
  })

  it('sends team mutations with encoded IDs, exact payloads, and cancellation', async () => {
    const controller = new AbortController()
    const requests: InternalAxiosRequestConfig[] = []
    apiClient.defaults.adapter = (config) => {
      requests.push(config)
      return Promise.resolve(response(config, {}))
    }

    await teamApi.changeRole('member/a', 'role-1', {
      signal: controller.signal,
    })
    await teamApi.deactivateMember('member/a', { signal: controller.signal })
    await teamApi.activateMember('member/a', { signal: controller.signal })
    await teamApi.deleteMember('member/a', { signal: controller.signal })
    await teamApi.createRole(
      { name: 'Dispatch', permissions: ['orders.view'] },
      { signal: controller.signal },
    )
    await teamApi.updateRole(
      'role/a',
      { name: 'Dispatch+', permissions: ['orders.view', 'orders.manage'] },
      { signal: controller.signal },
    )
    await teamApi.deleteRole('role/a', { signal: controller.signal })
    await teamApi.updateUserPermissions('user/a', ['parts.view'], {
      signal: controller.signal,
    })
    await teamApi.createInvitation('role-1', { signal: controller.signal })
    await teamApi.revokeInvitation('invite/a', { signal: controller.signal })

    expect(
      requests.map((request) => ({
        url: request.url,
        method: request.method,
        data: typeof request.data === 'string' ? request.data : undefined,
      })),
    ).toEqual([
      {
        url: '/team/members/member%2Fa/role',
        method: 'patch',
        data: '{"roleId":"role-1"}',
      },
      {
        url: '/team/members/member%2Fa/deactivate',
        method: 'patch',
        data: undefined,
      },
      {
        url: '/team/members/member%2Fa/activate',
        method: 'patch',
        data: undefined,
      },
      { url: '/team/members/member%2Fa', method: 'delete', data: undefined },
      {
        url: '/team/roles',
        method: 'post',
        data: '{"name":"Dispatch","permissions":["orders.view"]}',
      },
      {
        url: '/team/roles/role%2Fa',
        method: 'patch',
        data: '{"name":"Dispatch+","permissions":["orders.view","orders.manage"]}',
      },
      { url: '/team/roles/role%2Fa', method: 'delete', data: undefined },
      {
        url: '/team/users/user%2Fa/permissions',
        method: 'put',
        data: '{"permissions":["parts.view"]}',
      },
      {
        url: '/team/invitations',
        method: 'post',
        data: '{"roleId":"role-1"}',
      },
      {
        url: '/team/invitations/invite%2Fa',
        method: 'delete',
        data: undefined,
      },
    ])

    controller.abort()
    expect(requests.every((request) => request.signal?.aborted)).toBe(true)
  })
})
