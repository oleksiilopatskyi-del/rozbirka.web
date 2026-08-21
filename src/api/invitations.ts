import { apiClient, publicApiClient } from './client'
import type { ApiProblem, RequestOptions } from './contracts'
import { normalizeApiProblem } from './errors'

export interface InvitationInfo {
  tenantName: string
  roleName: string
  createdByName: string
  expiresAt: string
  isValid: boolean
}

export interface AcceptInvitationResult {
  tenantId: string
  tenantName: string
  role: string
  permissions: string[]
}

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

const problemError = (problem: ApiProblem): Error & ApiProblem =>
  Object.assign(new Error(problem.message), problem)

export const invitationsApi = {
  async info(
    code: string,
    options: RequestOptions = {},
  ): Promise<InvitationInfo> {
    try {
      const response = await publicApiClient.get<InvitationInfo>(
        `/invitations/${encodeURIComponent(code)}/info`,
        requestConfig(options),
      )
      return response.data
    } catch (error) {
      throw problemError(normalizeApiProblem(error))
    }
  },

  async accept(
    code: string,
    options: RequestOptions = {},
  ): Promise<AcceptInvitationResult> {
    try {
      const response = await apiClient.post<AcceptInvitationResult>(
        '/invitations/accept',
        { code },
        requestConfig(options),
      )
      return response.data
    } catch (error) {
      throw problemError(normalizeApiProblem(error))
    }
  },
}
