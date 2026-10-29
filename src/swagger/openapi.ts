export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Green Node IoT Sensor Backend API',
    version: '1.1.0',
    description: `
REST & WebSocket API for greenhouse, plant monitoring, and smart agriculture IoT sensor nodes.
Collects and serves:
* **Humidity** (% relative humidity)
* **Temperature** (°C)
* **Soil Moisture** (% volumetric / calibrated)
* **Light Sensor** (Lux / ambient intensity)
* Devices are tracked by standard **UUID**. Physical **location** is managed on device registration.
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
    { name: 'Devices', description: 'Sensor nodes registration and location management' },
    { name: 'Health', description: 'System health and connection status' }
  ],
  paths: {
    '/api/readings': {
      post: {
        tags: ['Readings'],
        summary: 'Ingest a single sensor reading',
        description: 'Send current humidity, temperature, soil moisture, and light data from an IoT node with its UUID. Broadcasts in real-time over WebSocket.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateReadingInput'
              },
              example: {
                deviceId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
                temperature: 24.5,
                humidity: 65.2,
                soilMoisture: 42.0,
                light: 520
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
            description: 'Validation Error (invalid UUID or out-of-range sensor values)'
          }
        }
      },
      get: {
        tags: ['Readings'],
        summary: 'Query sensor readings history',
        description: 'Retrieve paginated historical readings with optional filters for deviceId (UUID) and date range.',
        parameters: [
          {
            name: 'deviceId',
            in: 'query',
            description: 'Filter by specific node UUID',
            required: false,
            schema: { type: 'string', format: 'uuid' }
          },
          {
            name: 'startDate',
            in: 'query',
            description: 'ISO-8601 start timestamp filter',
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
            description: 'Paginated list of sensor readings'
          }
        }
      }
    },
    '/api/readings/batch': {
      post: {
        tags: ['Readings'],
        summary: 'Batch ingest sensor readings',
        description: 'Upload an array of readings from edge nodes.',
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
        description: 'Returns the latest single reading, including the registered device location from the database.',
        parameters: [
          {
            name: 'deviceId',
            in: 'query',
            description: 'Specific node UUID',
            required: false,
            schema: { type: 'string', format: 'uuid' }
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
            description: 'Lookback timeframe in hours (default: 24)',
            required: false,
            schema: { type: 'integer', default: 24 }
          },
          {
            name: 'deviceId',
            in: 'query',
            description: 'Filter stats to a specific node UUID',
            required: false,
            schema: { type: 'string', format: 'uuid' }
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
      post: {
        tags: ['Devices'],
        summary: 'Register a device and assign its location',
        description: 'Register a sensor node UUID in the database with a human-readable name and its physical installation location.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['deviceId', 'location'],
                properties: {
                  deviceId: { type: 'string', format: 'uuid', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
                  name: { type: 'string', example: 'Bay 1 Tomato Sensor' },
                  location: { type: 'string', example: 'Greenhouse North - Tray 4' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Device registered successfully'
          }
        }
      },
      get: {
        tags: ['Devices'],
        summary: 'List all registered devices',
        description: 'Returns all detected or registered sensor nodes, their assigned locations, last seen timestamps, and status.',
        responses: {
          200: {
            description: 'List of devices'
          }
        }
      }
    },
    '/api/devices/{deviceId}': {
      get: {
        tags: ['Devices'],
        summary: 'Get device details by UUID',
        parameters: [
          {
            name: 'deviceId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          200: { description: 'Device found' },
          404: { description: 'Device not found' }
        }
      },
      put: {
        tags: ['Devices'],
        summary: 'Update device location or metadata',
        parameters: [
          {
            name: 'deviceId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  location: { type: 'string' },
                  status: { type: 'string', enum: ['online', 'warning', 'offline'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Device updated' },
          404: { description: 'Device not found' }
        }
      }
    },
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'System health check',
        responses: {
          200: { description: 'System healthy' }
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
          deviceId: { type: 'string', format: 'uuid', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
          temperature: { type: 'number', example: 24.5, description: 'Temperature in Celsius (-50 to 100)' },
          humidity: { type: 'number', example: 65.0, description: 'Relative humidity % (0 to 100)' },
          soilMoisture: { type: 'number', example: 45.2, description: 'Soil moisture % (0 to 100)' },
          light: { type: 'number', example: 680, description: 'Ambient light in Lux (>= 0)' },
          metadata: { type: 'object', additionalProperties: true },
          timestamp: { type: 'string', format: 'date-time', description: 'Optional ISO timestamp. Defaults to now.' }
        }
      },
      Reading: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '6720bb1c080b08e2f89c92a1' },
          deviceId: { type: 'string', format: 'uuid', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
          temperature: { type: 'number', example: 24.5 },
          humidity: { type: 'number', example: 65.0 },
          soilMoisture: { type: 'number', example: 45.2 },
          light: { type: 'number', example: 680 },
          timestamp: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
};
