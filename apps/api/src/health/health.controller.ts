import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Check API availability" })
  @ApiOkResponse({
    description: "API is available",
    schema: {
      properties: {
        status: {
          example: "ok",
          type: "string",
        },
      },
      required: ["status"],
      type: "object",
    },
  })
  getHealth() {
    return { status: "ok" } as const;
  }
}
