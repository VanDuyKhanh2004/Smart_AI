const crypto = require('crypto');

function buildEmbeddingContent(product) {
  const { name, brand, price, specs, description, colors } = product;

  const parts = [];

  parts.push(`${name}`);
  parts.push(`${brand}`);
  parts.push(`${price}`);

  if (description) {
    parts.push(`${description}`);
  }

  if (specs) {
    if (specs.screen) {
      if (specs.screen.size) parts.push(`${specs.screen.size}`);
      if (specs.screen.technology) parts.push(`${specs.screen.technology}`);
      if (specs.screen.resolution) parts.push(`${specs.screen.resolution}`);
    }

    if (specs.processor) {
      if (specs.processor.chipset) parts.push(`${specs.processor.chipset}`);
      if (specs.processor.cpu) parts.push(`${specs.processor.cpu}`);
      if (specs.processor.gpu) parts.push(`${specs.processor.gpu}`);
    }

    if (specs.memory) {
      if (specs.memory.ram) parts.push(`${specs.memory.ram}`);
      if (specs.memory.storage) parts.push(`${specs.memory.storage}`);
    }

    if (specs.camera) {
      if (specs.camera.rear) {
        if (specs.camera.rear.primary) parts.push(`${specs.camera.rear.primary}`);
        if (specs.camera.rear.secondary) parts.push(`${specs.camera.rear.secondary}`);
        if (specs.camera.rear.tertiary) parts.push(`${specs.camera.rear.tertiary}`);
      }
      if (specs.camera.front) parts.push(`${specs.camera.front}`);
      if (specs.camera.features && specs.camera.features.length > 0) {
        parts.push(`${specs.camera.features.join(', ')}`);
      }
    }

    if (specs.battery) {
      if (specs.battery.capacity) parts.push(`${specs.battery.capacity}`);
      if (specs.battery.charging) {
        if (specs.battery.charging.wired) parts.push(`${specs.battery.charging.wired}`);
        if (specs.battery.charging.wireless) parts.push(`${specs.battery.charging.wireless}`);
      }
    }

    if (specs.os) parts.push(`${specs.os}`);

    if (specs.dimensions) parts.push(`${specs.dimensions}`);
    if (specs.weight) parts.push(`${specs.weight}`);

    if (specs.connectivity) {
      if (specs.connectivity.network && specs.connectivity.network.length > 0) {
        parts.push(`${specs.connectivity.network.join(', ')}`);
      }
      if (specs.connectivity.ports && specs.connectivity.ports.length > 0) {
        parts.push(`${specs.connectivity.ports.join(', ')}`);
      }
    }
  }

  if (colors && colors.length > 0) {
    parts.push(`${colors.join(', ')}`);
  }

  return parts.join('. ');
}

function computeContentHash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

module.exports = { buildEmbeddingContent, computeContentHash };
