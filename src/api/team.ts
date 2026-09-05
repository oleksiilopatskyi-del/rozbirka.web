import { apiClient } from './client'
import type { RequestOptions } from './contracts'

export interface RoleDto {
  id: string
  name: string
  isSystem: boolean
  permissions: string[] | null
  membersCount: number | null
}

export interface TeamMemberDto {
  id: string
  userId: string
  name: string
  phone: string | null
  role: RoleDto
  isActive: boolean
  joinedAt: string
}

export interface TeamMemberDetailDto extends TeamMemberDto {
  deactivatedAt: string | null
  stats: {
    ordersCreated: number
    partsAdded: number
  }
}

export interface RoleDetailDto extends Omit<
  RoleDto,
  'permissions' | 'membersCount'
> {
  permissions: string[]
  membersCount: number
  members: { id: string; name: string; isActive: boolean }[] | null
}

export interface UserPermissionsDto {
  userId: string
  roleName: string
  permissions: string[]
}

export interface InvitationDto {
  id: string
  code: string
  role: RoleDto
  expiresAt: string
  createdAt: string
  isUsed: boolean
  isRevoked: boolean
  isExpired: boolean
}

export interface CreateRoleRequest {
  name: string
  permissions: string[]
}

export interface UpdateRoleRequest {
  name?: string
  permissions?: string[]
}

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

const entityPath = (path: string, id: string) =>
  `${path}/${encodeURIComponent(id)}`

export const teamApi = {
  async listMembers(options: RequestOptions = {}): Promise<TeamMemberDto[]> {
    return (
      await apiClient.get<TeamMemberDto[]>(
        '/team/members',
        requestConfig(options),
      )
    ).data
  },

  async getMember(
    id: string,
    options: RequestOptions = {},
  ): Promise<TeamMemberDetailDto> {
    return (
      await apiClient.get<TeamMemberDetailDto>(
        entityPath('/team/members', id),
        requestConfig(options),
      )
    ).data
  },

  async changeRole(
    memberId: string,
    roleId: string,
    options: RequestOptions = {},
  ): Promise<TeamMemberDto> {
    return (
      await apiClient.patch<TeamMemberDto>(
        `${entityPath('/team/members', memberId)}/role`,
        { roleId },
        requestConfig(options),
      )
    ).data
  },

  async deactivateMember(
    memberId: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await apiClient.patch(
      `${entityPath('/team/members', memberId)}/deactivate`,
      undefined,
      requestConfig(options),
    )
  },

  async activateMember(
    memberId: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await apiClient.patch(
      `${entityPath('/team/members', memberId)}/activate`,
      undefined,
      requestConfig(options),
    )
  },

  async deleteMember(
    memberId: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await apiClient.delete(
      entityPath('/team/members', memberId),
      requestConfig(options),
    )
  },

  async listRoles(options: RequestOptions = {}): Promise<RoleDto[]> {
    return (
      await apiClient.get<RoleDto[]>('/team/roles', requestConfig(options))
    ).data
  },

  async getRole(
    id: string,
    options: RequestOptions = {},
  ): Promise<RoleDetailDto> {
    return (
      await apiClient.get<RoleDetailDto>(
        entityPath('/team/roles', id),
        requestConfig(options),
      )
    ).data
  },

  async createRole(
    request: CreateRoleRequest,
    options: RequestOptions = {},
  ): Promise<RoleDto> {
    return (
      await apiClient.post<RoleDto>(
        '/team/roles',
        request,
        requestConfig(options),
      )
    ).data
  },

  async updateRole(
    id: string,
    request: UpdateRoleRequest,
    options: RequestOptions = {},
  ): Promise<RoleDto> {
    return (
      await apiClient.patch<RoleDto>(
        entityPath('/team/roles', id),
        request,
        requestConfig(options),
      )
    ).data
  },

  async deleteRole(id: string, options: RequestOptions = {}): Promise<void> {
    await apiClient.delete(
      entityPath('/team/roles', id),
      requestConfig(options),
    )
  },

  async getUserPermissions(
    userId: string,
    options: RequestOptions = {},
  ): Promise<UserPermissionsDto> {
    return (
      await apiClient.get<UserPermissionsDto>(
        `${entityPath('/team/users', userId)}/permissions`,
        requestConfig(options),
      )
    ).data
  },

  async updateUserPermissions(
    userId: string,
    permissions: string[],
    options: RequestOptions = {},
  ): Promise<UserPermissionsDto> {
    return (
      await apiClient.put<UserPermissionsDto>(
        `${entityPath('/team/users', userId)}/permissions`,
        { permissions },
        requestConfig(options),
      )
    ).data
  },

  async listInvitations(
    options: RequestOptions = {},
  ): Promise<InvitationDto[]> {
    return (
      await apiClient.get<InvitationDto[]>(
        '/team/invitations',
        requestConfig(options),
      )
    ).data
  },

  async createInvitation(
    roleId: string,
    options: RequestOptions = {},
  ): Promise<InvitationDto> {
    return (
      await apiClient.post<InvitationDto>(
        '/team/invitations',
        { roleId },
        requestConfig(options),
      )
    ).data
  },

  async revokeInvitation(
    id: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await apiClient.delete(
      entityPath('/team/invitations', id),
      requestConfig(options),
    )
  },
}
