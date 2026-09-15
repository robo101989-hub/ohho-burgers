const STORAGE_KEY = 'ohho.posPrinter.config';

const DEFAULT_CONFIG = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
  paperWidth: '58mm'
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function esc(...bytes) {
  return bytes;
}

function textBytes(value) {
  const text = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[₹]/g, 'Rs ')
    .replace(/[^\x00-\xFF]/g, '');

  return [...new TextEncoder().encode(text)];
}

function buildEscPosReceipt(order, outlet, cart) {
  const bytes = [];

  const add = (...values) => bytes.push(...values);

  const text = (value, options = {}) => {
    if (options.align === 'center') add(...esc(0x1b, 0x61, 0x01));
    else if (options.align === 'right') add(...esc(0x1b, 0x61, 0x02));
    else add(...esc(0x1b, 0x61, 0x00));

    if (options.bold) add(...esc(0x1b, 0x45, 0x01));

    if (options.size === 2) {
      add(...esc(0x1d, 0x21, 0x11));
    }

    add(...textBytes(value));
    add(0x0a);

    if (options.size === 2) {
      add(...esc(0x1d, 0x21, 0x00));
    }

    if (options.bold) add(...esc(0x1b, 0x45, 0x00));
  };

  const rule = () => {
    text('--------------------------------');
  };

  add(...esc(0x1b, 0x40));

  text('OHHO BURGERS', {
    align: 'center',
    bold: true,
    size: 2
  });

  text(outlet?.name || 'OHHO BURGERS', {
    align: 'center',
    bold: true
  });

  text('POS ORDER', {
    align: 'center'
  });

  rule();

  text(`ORDER #${order?.order_number || 'NEW'}`, {
    bold: true
  });

  text(
    `TYPE: ${String(order?.order_type || '').replaceAll('_', '-')}`
  );

  if (order?.table_number) {
    text(`TABLE: ${order.table_number}`, {
      bold: true
    });
  }

  text(`PAYMENT: ${order?.payment_method || 'CASH'}`);

  rule();

  for (const item of cart || []) {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    const total = price * quantity;

    text(`${item.name} x${quantity}`);
    text(`Rs ${total.toFixed(0)}`, {
      align: 'right'
    });
  }

  rule();

  text(`TOTAL: Rs ${Number(order?.total || 0).toFixed(0)}`, {
    align: 'right',
    bold: true,
    size: 2
  });

  text('');

  text('THANK YOU FOR ORDERING!', {
    align: 'center',
    bold: true
  });

  text('Happiness in Every Bite', {
    align: 'center'
  });

  // Feed paper and cut.
  add(...esc(0x1b, 0x64, 0x05));
  add(...esc(0x1d, 0x56, 0x00));

  return new Uint8Array(bytes);
}

export const posPrinter = {
  config: loadConfig(),
  port: null,

  async connect(config = {}) {
    if (!('serial' in navigator)) {
      throw new Error(
        'Web Serial is not supported. Please use Google Chrome on this computer.'
      );
    }

    this.config = {
      ...this.config,
      ...config
    };

    if (!this.port) {
      this.port = await navigator.serial.requestPort();
    }

    if (!this.port.readable && !this.port.writable) {
      await this.port.open({
        baudRate: Number(this.config.baudRate) || 9600,
        dataBits: Number(this.config.dataBits) || 8,
        stopBits: Number(this.config.stopBits) || 1,
        parity: this.config.parity || 'none',
        flowControl: this.config.flowControl || 'none'
      });
    }

    saveConfig(this.config);

    return {
      connected: true,
      transport: 'web-serial',
      name: 'Bluetooth Thermal Printer',
      ...this.config
    };
  },

  async disconnect() {
    if (this.port) {
      try {
        if (this.port.readable || this.port.writable) {
          await this.port.close();
        }
      } catch {
        // Port may already be closed.
      }
    }

    this.port = null;
  },

  async findBluetoothPrinters() {
    if (!('serial' in navigator)) {
      throw new Error(
        'Web Serial is not supported. Please use Google Chrome.'
      );
    }

    const ports = await navigator.serial.getPorts();

    return ports.map((port, index) => {
      const info = port.getInfo();

      return {
        id: `${info.usbVendorId || 'serial'}-${info.usbProductId || index}`,
        name: 'Bluetooth Thermal Printer',
        port,
        transport: 'bluetooth-serial'
      };
    });
  },

  async print(order, outlet, cart) {
    if (!this.port) {
      throw new Error('No Bluetooth printer is connected.');
    }

    if (!this.port.writable) {
      await this.port.open({
        baudRate: Number(this.config.baudRate) || 9600,
        dataBits: Number(this.config.dataBits) || 8,
        stopBits: Number(this.config.stopBits) || 1,
        parity: this.config.parity || 'none',
        flowControl: this.config.flowControl || 'none'
      });
    }

    const data = buildEscPosReceipt(order, outlet, cart);
    const writer = this.port.writable.getWriter();

    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }

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
    return Boolean(this.port && this.port.writable);
  },

  async shutdown() {
    await this.disconnect();
  }
};

export default posPrinter;
