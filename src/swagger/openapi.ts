export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Green Node IoT Sensor Backend API',
    version: '1.0.0',
    description: `
REST & WebSocket API for greenhouse, plant monitoring, and smart agriculture IoT sensor nodes.
Collects and serves:
* **Humidity** (% relative humidity)
* **Temperature** (°C)
* **Soil Moisture** (% volumetric / calibrated)
* **Light Sensor** (Lux / ambient intensity)
* Real-time WebSocket streaming at \`ws://<host>:<port>/ws\`
    `
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local Development Server'
    }
  ],
  tags: [
    { name: 'Readings', description: 'Sensor data ingestion and queries' },
    { name: 'Devices', description: 'Sensor nodes registry and status' },
    { name: 'Health', description: 'System health and connection status' }
  ],
  paths: {
    '/api/readings': {
      post: {
        tags: ['Readings'],
        summary: 'Ingest a single sensor reading',
        description: 'Send current humidity, temperature, soil moisture, and light data from an IoT node (e.g. ESP32, Arduino, Raspberry Pi). Automatically broadcasts to real-time WebSocket clients.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateReadingInput'
              },
              example: {
                deviceId: 'node-greenhouse-01',
                temperature: 24.5,
                humidity: 65.2,
                soilMoisture: 42.0,
                light: 520,
                battery: 92,
                location: 'Zone A - Tomatoes'
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Reading saved and broadcasted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Sensor reading recorded successfully' },
                    data: { $ref: '#/components/schemas/Reading' }
                  }
                }
              }
            }
          },
          400: {
            description: 'Validation Error (invalid value ranges or missing fields)'
          }
        }
      },
      get: {
        tags: ['Readings'],
        summary: 'Query sensor readings history',
        description: 'Retrieve paginated historical readings with optional filters for deviceId and date range.',
        parameters: [
          {
            name: 'deviceId',
            in: 'query',
            description: 'Filter by specific node identifier',
            required: false,
            schema: { type: 'string' }
          },
          {
            name: 'startDate',
            in: 'query',
            description: 'ISO-8601 start timestamp filter (e.g. 2026-10-29T00:00:00Z)',
            required: false,
            schema: { type: 'string', format: 'date-time' }
          },
          {
            name: 'endDate',
            in: 'query',
            description: 'ISO-8601 end timestamp filter',
            required: false,
            schema: { type: 'string', format: 'date-time' }
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum number of items per page (default: 50, max: 1000)',
            required: false,
            schema: { type: 'integer', default: 50 }
          },
          {
            name: 'page',
            in: 'query',
            description: 'Page number for pagination',
            required: false,
            schema: { type: 'integer', default: 1 }
          },
          {
            name: 'sortBy',
            in: 'query',
            description: 'Sort field',
            required: false,
            schema: {
              type: 'string',
              enum: ['timestamp', 'temperature', 'humidity', 'soilMoisture', 'light'],
              default: 'timestamp'
            }
          },
          {
            name: 'sortOrder',
            in: 'query',
            description: 'Sort direction',
            required: false,
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
          }
        ],
        responses: {
          200: {
            description: 'Paginated list of sensor readings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Reading' }
                    },
                    pagination: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 50 },
                        total: { type: 'integer', example: 1420 },
                        totalPages: { type: 'integer', example: 29 }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/readings/batch': {
      post: {
        tags: ['Readings'],
        summary: 'Batch ingest sensor readings',
        description: 'Upload an array of readings. Perfect for edge nodes reconnecting after an offline period.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['readings'],
                properties: {
                  readings: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/CreateReadingInput' }
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Batch readings stored successfully'
          }
        }
      }
    },
    '/api/readings/latest': {
      get: {
        tags: ['Readings'],
        summary: 'Get most recent sensor reading',
        description: 'Returns the latest single reading from all devices or filtered by deviceId.',
        parameters: [
          {
            name: 'deviceId',
            in: 'query',
            description: 'Specific node ID',
            required: false,
            schema: { type: 'string' }
          }
        ],
        responses: {
          200: {
            description: 'Latest sensor reading'
          },
          404: {
            description: 'No reading found'
          }
        }
      }
    },
    '/api/readings/stats': {
      get: {
        tags: ['Readings'],
        summary: 'Get aggregated sensor statistics',
        description: 'Calculates min, max, and average values for humidity, temperature, soil moisture, and light over a given timeframe (default: past 24 hours).',
        parameters: [
          {
            name: 'hours',
            in: 'query',
            description: 'Lookback timeframe in hours (e.g. 1, 6, 24, 72)',
            required: false,
            schema: { type: 'integer', default: 24 }
          },
          {
            name: 'deviceId',
            in: 'query',
            description: 'Filter stats to a specific node',
            required: false,
            schema: { type: 'string' }
          }
        ],
        responses: {
          200: {
            description: 'Aggregated metrics summary'
          }
        }
      }
    },
    '/api/devices': {
      get: {
        tags: ['Devices'],
        summary: 'List active sensor nodes',
        description: 'Returns all detected sensor nodes, their last seen timestamps, locations, and latest readings.',
        responses: {
          200: {
            description: 'List of devices'
          }
        }
      }
    },
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'System health check',
        description: 'Returns status of backend, MongoDB connection state, uptime, and connected WebSocket clients.',
        responses: {
          200: {
            description: 'System healthy'
          },
          503: {
            description: 'System degraded or disconnected from database'
          }
        }
      }
    }
  },
  components: {
    schemas: {
      CreateReadingInput: {
        type: 'object',
        required: ['deviceId', 'temperature', 'humidity', 'soilMoisture', 'light'],
        properties: {
          deviceId: { type: 'string', example: 'node-greenhouse-01' },
          temperature: { type: 'number', example: 24.5, description: 'Temperature in Celsius (-50 to 100)' },
          humidity: { type: 'number', example: 65.0, description: 'Relative humidity % (0 to 100)' },
          soilMoisture: { type: 'number', example: 45.2, description: 'Soil moisture % (0 to 100)' },
          light: { type: 'number', example: 680, description: 'Ambient light in Lux (>= 0)' },
          battery: { type: 'number', example: 95, description: 'Optional battery % or voltage' },
          location: { type: 'string', example: 'Tray 3 - Herbs' },
          metadata: { type: 'object', additionalProperties: true },
          timestamp: { type: 'string', format: 'date-time', description: 'Optional ISO timestamp. Defaults to now.' }
        }
      },
      Reading: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '6720bb1c080b08e2f89c92a1' },
          deviceId: { type: 'string', example: 'node-greenhouse-01' },
          temperature: { type: 'number', example: 24.5 },
          humidity: { type: 'number', example: 65.0 },
          soilMoisture: { type: 'number', example: 45.2 },
          light: { type: 'number', example: 680 },
          battery: { type: 'number', example: 95 },
          location: { type: 'string', example: 'Tray 3 - Herbs' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
};
