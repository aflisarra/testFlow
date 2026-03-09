"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
exports.__esModule = true;
exports.LogoBoxComponent = void 0;
var common_1 = require("@angular/common");
var core_1 = require("@angular/core");
var LogoBoxComponent = /** @class */ (function () {
    function LogoBoxComponent() {
        this.className = '';
        this.height = '';
        this.logoHeight = '';
    }
    __decorate([
        core_1.Input()
    ], LogoBoxComponent.prototype, "className");
    __decorate([
        core_1.Input()
    ], LogoBoxComponent.prototype, "height");
    __decorate([
        core_1.Input()
    ], LogoBoxComponent.prototype, "logoHeight");
    LogoBoxComponent = __decorate([
        core_1.Component({
            selector: 'app-logo-box',
            standalone: true,
            imports: [common_1.CommonModule],
            template: "\n    <div [class]=\"className\">\n      <a href=\"index.html\" class=\"logo-dark\">\n        <img\n          src=\"assets/images/logo-sm.png\"\n          [ngClass]=\"className == 'logo-box' ? 'logo-sm' : 'me-1'\"\n          [height]=\"logoHeight\"\n          alt=\"logo sm\"\n        />\n        <img\n          src=\"assets/images/logo-dark.png\"\n          [ngClass]=\"className == 'logo-box' ? 'logo-lg' : ''\"\n          [height]=\"height\"\n          alt=\"logo dark\"\n        />\n      </a>\n\n      <a href=\"index.html\" class=\"logo-light\">\n        <img\n          src=\"assets/images/logo-sm.png\"\n          [ngClass]=\"className == 'logo-box' ? 'logo-sm' : 'me-1'\"\n          [height]=\"logoHeight\"\n          alt=\"logo sm\"\n        />\n        <img\n          src=\"assets/images/logo-light.png\"\n          [ngClass]=\"className == 'logo-box' ? 'logo-lg' : ''\"\n          [height]=\"height\"\n          alt=\"logo light\"\n        />\n      </a>\n    </div>\n  "
        })
    ], LogoBoxComponent);
    return LogoBoxComponent;
}());
exports.LogoBoxComponent = LogoBoxComponent;
