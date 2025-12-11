export interface ShippingZone {
  id: number;
  merchantId: number;
  name: string;
  countries: string[];
  rates: ShippingRate[];
  isDefault: boolean;
  isTemplate: boolean;
  createdAt: Date;
}

export interface ShippingRate {
  id: number;
  name: string;
  type: "flat" | "weight_based" | "price_based" | "free";
  price: number;
  minWeight?: number;
  maxWeight?: number;
  minOrderValue?: number;
  maxOrderValue?: number;
  freeShippingThreshold?: number;
  estimatedDays: string;
}

const DEFAULT_ZONE_TEMPLATE: Omit<ShippingZone, "id" | "merchantId" | "createdAt"> = {
  name: "Default Zone (US/CA)",
  countries: ["US", "CA"],
  isDefault: true,
  isTemplate: false,
  rates: [
    {
      id: 1,
      name: "Standard Shipping",
      type: "flat",
      price: 599,
      estimatedDays: "5-7 business days",
    },
    {
      id: 2,
      name: "Express Shipping",
      type: "flat",
      price: 1299,
      estimatedDays: "2-3 business days",
    },
    {
      id: 3,
      name: "Free Shipping",
      type: "free",
      price: 0,
      freeShippingThreshold: 5000,
      estimatedDays: "5-7 business days",
    },
  ],
};

class ShippingService {
  private zones: Map<number, ShippingZone> = new Map();
  private nextZoneId: number = 1;
  private nextRateId: number = 100;

  constructor() {}

  private createDefaultZoneForMerchant(merchantId: number): ShippingZone {
    const rateStartId = this.nextRateId;
    this.nextRateId += 10;

    const zone: ShippingZone = {
      id: this.nextZoneId++,
      merchantId,
      name: DEFAULT_ZONE_TEMPLATE.name,
      countries: [...DEFAULT_ZONE_TEMPLATE.countries],
      isDefault: true,
      isTemplate: false,
      createdAt: new Date(),
      rates: DEFAULT_ZONE_TEMPLATE.rates.map((r, i) => ({
        ...r,
        id: rateStartId + i,
      })),
    };

    this.zones.set(zone.id, zone);
    console.log(`[Shipping] Created default zone ${zone.id} for merchant ${merchantId}`);
    return zone;
  }

  async getZones(merchantId: number): Promise<ShippingZone[]> {
    const merchantZones: ShippingZone[] = [];
    
    for (const zone of this.zones.values()) {
      if (zone.merchantId === merchantId) {
        merchantZones.push(zone);
      }
    }
    
    if (merchantZones.length === 0) {
      const defaultZone = this.createDefaultZoneForMerchant(merchantId);
      merchantZones.push(defaultZone);
    }
    
    return merchantZones;
  }

  async getZone(zoneId: number, merchantId: number): Promise<ShippingZone | null> {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.merchantId !== merchantId) {
      return null;
    }
    return zone;
  }

  async createZone(merchantId: number, data: {
    name: string;
    countries: string[];
    rates?: Omit<ShippingRate, "id">[];
  }): Promise<ShippingZone> {
    const zone: ShippingZone = {
      id: this.nextZoneId++,
      merchantId,
      name: data.name,
      countries: data.countries,
      isDefault: false,
      isTemplate: false,
      createdAt: new Date(),
      rates: (data.rates || []).map(rate => ({
        ...rate,
        id: this.nextRateId++,
      })),
    };

    this.zones.set(zone.id, zone);
    console.log(`[Shipping] Created zone ${zone.id}: ${zone.name} for merchant ${merchantId}`);
    return zone;
  }

  async updateZone(zoneId: number, merchantId: number, updates: Partial<Omit<ShippingZone, "id" | "merchantId" | "createdAt" | "isTemplate">>): Promise<ShippingZone | null> {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.merchantId !== merchantId) {
      return null;
    }

    const updatedZone: ShippingZone = { ...zone, ...updates };
    this.zones.set(zoneId, updatedZone);
    return updatedZone;
  }

  async deleteZone(zoneId: number, merchantId: number): Promise<boolean> {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.merchantId !== merchantId) {
      return false;
    }
    
    if (zone.isDefault) {
      return false;
    }

    this.zones.delete(zoneId);
    console.log(`[Shipping] Deleted zone ${zoneId} for merchant ${merchantId}`);
    return true;
  }

  async addRate(zoneId: number, merchantId: number, rate: Omit<ShippingRate, "id">): Promise<ShippingRate | null> {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.merchantId !== merchantId) {
      return null;
    }

    const newRate: ShippingRate = {
      ...rate,
      id: this.nextRateId++,
    };

    zone.rates.push(newRate);
    this.zones.set(zoneId, zone);
    console.log(`[Shipping] Added rate ${newRate.id} to zone ${zoneId}`);
    return newRate;
  }

  async updateRate(zoneId: number, rateId: number, merchantId: number, updates: Partial<Omit<ShippingRate, "id">>): Promise<ShippingRate | null> {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.merchantId !== merchantId) {
      return null;
    }

    const rateIndex = zone.rates.findIndex(r => r.id === rateId);
    if (rateIndex === -1) {
      return null;
    }

    zone.rates[rateIndex] = { ...zone.rates[rateIndex], ...updates };
    this.zones.set(zoneId, zone);
    return zone.rates[rateIndex];
  }

  async deleteRate(zoneId: number, rateId: number, merchantId: number): Promise<boolean> {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.merchantId !== merchantId) {
      return false;
    }

    const initialLength = zone.rates.length;
    zone.rates = zone.rates.filter(r => r.id !== rateId);
    
    if (zone.rates.length < initialLength) {
      this.zones.set(zoneId, zone);
      return true;
    }
    return false;
  }

  async calculateShipping(merchantId: number, orderData: {
    country: string;
    subtotal: number;
    weight?: number;
  }): Promise<{ rates: { id: number; name: string; price: number; estimatedDays: string }[] }> {
    const zones = await this.getZones(merchantId);
    const applicableZone = zones.find(z => z.countries.includes(orderData.country)) || zones.find(z => z.isDefault);

    if (!applicableZone) {
      return { rates: [] };
    }

    const applicableRates = applicableZone.rates
      .filter(rate => {
        if (rate.type === "free" && rate.freeShippingThreshold) {
          return orderData.subtotal >= rate.freeShippingThreshold;
        }
        if (rate.type === "price_based") {
          const minOk = !rate.minOrderValue || orderData.subtotal >= rate.minOrderValue;
          const maxOk = !rate.maxOrderValue || orderData.subtotal <= rate.maxOrderValue;
          return minOk && maxOk;
        }
        if (rate.type === "weight_based" && orderData.weight) {
          const minOk = !rate.minWeight || orderData.weight >= rate.minWeight;
          const maxOk = !rate.maxWeight || orderData.weight <= rate.maxWeight;
          return minOk && maxOk;
        }
        return true;
      })
      .map(rate => ({
        id: rate.id,
        name: rate.name,
        price: rate.type === "free" ? 0 : rate.price,
        estimatedDays: rate.estimatedDays,
      }));

    return { rates: applicableRates };
  }
}

export const shippingService = new ShippingService();
