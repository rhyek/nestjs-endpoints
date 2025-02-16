import { EndpointsModule } from "nestjs-endpoints";
import error from "./error.endpoint";
import status from "./status.endpoint";

@EndpointsModule({
  endpoints: [error, status],
})
export class TestModule {}
