import qz from 'qz-tray';

const STORAGE_KEY = 'ohho.posPrinter.config';

const DEFAULT_CONFIG = {
  transport: 'qz-serial',
  port: '',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'NONE',
  flowControl: 'NONE',
  paperWidth: '58mm',
  printerName: ''
};

function loadConfig() {
  try {
    return {
      ...DEFAULT_CONFIG,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...DEFAULT_CONFIG,
      ...config
    })
  );
}

function normalizeError(error) {
  if (error instanceof Error) return error;
  return new Error(String(error || 'Printer error'));
}

function textToHex(value) {
  const text = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[₹]/g, 'Rs ')
    .replace(/[^\x00-\xFF]/g, '');

  return [...new TextEncoder().encode(text)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function concatHex(...parts) {
  return parts.filter(Boolean).join('');
}

function esc(...bytes) {
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function buildEscPosReceipt(order, outlet, cart) {
  const lines = [];

  const addText = (text, options = {}) => {
    let command = '';

    if (options.align === 'center') command += esc(0x1b, 0x61, 0x01);
    if (options.align === 'right') command += esc(0x1b, 0x61, 0x02);
    if (options.align === 'left') command += esc(0x1b, 0x61, 0x00);

    if (options.bold) command += esc(0x1b, 0x45, 0x01);

    if (options.size === 2) {
      command += esc(0x1d, 0x21, 0x11);
    }

    command += textToHex(text) + '0a';

    if (options.size === 2) {
      command += esc(0x1d, 0x21, 0x00);
    }

    if (options.bold) command += esc(0x1b, 0x45, 0x00);

    lines.push(command);
  };

  const rule = () => {
    lines.push(textToHex('--------------------------------') + '0a');
  };

  addText('OHHO BURGERS', {
    align: 'center',
    bold: true,
    size: 2
  });

  addText(outlet?.name || 'OHHO BURGERS', {
    align: 'center',
    bold: true
  });

  addText('POS ORDER', { align: 'center' });

  rule();

  addText(`ORDER #${order?.order_number || 'NEW'}`, { bold: true });
  addText(
    `TYPE: ${String(order?.order_type || '').replaceAll('_', '-')}`
  );

  if (order?.table_number) {
    addText(`TABLE: ${order.table_number}`, { bold: true });
  }

  addText(`PAYMENT: ${order?.payment_method || 'CASH'}`);

  rule();

  for (const item of cart || []) {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    const total = price * quantity;

    addText(`${item.name} x${quantity}`);
    addText(`Rs ${total.toFixed(0)}`, { align: 'right' });
  }

  rule();

  addText(`TOTAL: Rs ${Number(order?.total || 0).toFixed(0)}`, {
    align: 'right',
    bold: true,
    size: 2
  });

  addText('', { align: 'center' });
  addText('THANK YOU FOR ORDERING!', {
    align: 'center',
    bold: true
  });
  addText('Happiness in Every Bite', {
    align: 'center'
  });

  // Feed and full cut.
  lines.push(
    esc(0x1b, 0x64, 0x05),
    esc(0x1d, 0x56, 0x00)
  );

  return concatHex(
    esc(0x1b, 0x40),
    ...lines
  );
}

export const posPrinter = {
  config: loadConfig(),

  async connect(config = {}) {
    this.config = {
      ...this.config,
      ...config
    };

    if (!this.config.port) {
      throw new Error('Select a Bluetooth printer before connecting.');
    }

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect();
    }

    await qz.serial.openPort(this.config.port, {
      baudRate: Number(this.config.baudRate) || 9600,
      dataBits: Number(this.config.dataBits) || 8,
      stopBits: Number(this.config.stopBits) || 1,
      parity: this.config.parity || 'NONE',
      flowControl: this.config.flowControl || 'NONE'
    });

    saveConfig(this.config);

    return {
      connected: true,
      ...this.config
    };
  },

  async disconnect() {
    if (this.config.port) {
      try {
        await qz.serial.closePort(this.config.port);
      } catch {
        // Port may already be closed.
      }
    }

    this.config = {
      ...this.config
    };
  },

  async findBluetoothPrinters() {
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect();
    }

    const ports = await qz.serial.findPorts();

    return ports.map(port => ({
      id: port,
      name: port.split('/').pop() || port,
      port,
      transport: 'bluetooth-serial'
    }));
  },

  async print(order, outlet, cart) {
    if (!this.config.port) {
      throw new Error('No Bluetooth printer is configured.');
    }

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect();
    }

    const data = buildEscPosReceipt(order, outlet, cart);

    await qz.serial.sendData(this.config.port, {
      type: 'HEX',
      data
    });

    return true;
  },

  getConfig() {
    return { ...this.config };
  },

  setConfig(config = {}) {
    this.config = {
      ...this.config,
      ...config
    };

    saveConfig(this.config);

    return this.getConfig();
  },

  buildReceipt(order, outlet, cart) {
    return buildEscPosReceipt(order, outlet, cart);
  },

  isConnected() {
    return Boolean(
      this.config.port &&
      qz.websocket.isActive()
    );
  },

  async shutdown() {
    await this.disconnect();

    if (qz.websocket.isActive()) {
      await qz.websocket.disconnect();
    }
  }
};

export default posPrinter;
