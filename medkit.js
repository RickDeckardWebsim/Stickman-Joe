export class Medkit {
    constructor(owner) { // Accept optional owner
        this.owner = owner;
        this.name = 'Medkit';
        this.icon = './medkit_icon.png';
        this.uses = 1;
        this.healAmount = 50;
        this.magSize = 0; // To prevent it from being treated as a gun with ammo
    }
}

export class Armor {
    constructor(owner) { // Accept optional owner
        this.owner = owner;
        this.name = 'Body Armor';
        this.icon = './armor_icon.png';
                this.armorAmount = 100;
        this.magSize = 0; // To prevent it from being treated as a gun with ammo
    }
}