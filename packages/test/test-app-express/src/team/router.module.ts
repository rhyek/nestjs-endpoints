import { EndpointRouterModule } from 'nestjs-endpoints';
import { TeamService } from './team.service';

// Lists its endpoints, which are built with this router's `endpoint`, through
// a callback: the router imports them when it runs, after this module has
// finished evaluating. `roster` is also discovered; `lead` is a named export.
export default EndpointRouterModule.create({
  rootDirectory: 'endpoints',
  providers: [TeamService],
  endpointConfig: { inject: { team: TeamService } },
  endpoints: () => [
    import('./endpoints/roster.endpoint.js'),
    import('./endpoints/lead.endpoint.js'),
  ],
});
