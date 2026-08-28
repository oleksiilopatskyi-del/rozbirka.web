import { handleRequest } from './router'
import { observeRequest } from './observability'

export default {
  fetch(request, env) {
    return observeRequest(request, (observedRequest) =>
      handleRequest(observedRequest, env),
    )
  },
} satisfies ExportedHandler<Env>
