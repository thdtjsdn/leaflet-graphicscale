/*
 * L.Control.Scale is used for displaying metric/imperial scale on the map.
 */

L.Control.GraphicScale = L.Control.extend({
    options: {
        position: 'bottomleft',
        updateWhenIdle: false,
        minUnitWidth: 30,
        maxUnitsWidth: 240,
        fill: 'hollow',
        doubleLine : false
    },

    onAdd: function (map) {
        this._map = map;

        this._possibleUnitsNum = [3, 5, 2, 4];
        this._possibleUnitsNumLen = this._possibleUnitsNum.length;
        this._possibleDivisions = [1, 0.5, 0.25, 0.2];
        this._possibleDivisionsLen = this._possibleDivisions.length;

        this._scale = this._addScale(this.options);

        map.on(this.options.updateWhenIdle ? 'moveend' : 'move', this._update, this);
        map.whenReady(this._update, this);

        return this._scale;
    },

    onRemove: function (map) {
        map.off(this.options.updateWhenIdle ? 'moveend' : 'move', this._update, this);
    },

    _addScale: function (options) {
        var classNames = ['leaflet-control-graphicscale'];
        if (options.fill) {
            classNames.push('filled');
            classNames.push('filled-'+options.fill);
        }
        if (options.doubleLine) {
            classNames.push('double');
        }
        
        var scale = L.DomUtil.create('div', classNames.join(' '));
        scale.appendChild( this._buildScaleDom() );
        // this._scale.innerHTML = L.DomUtil.get('scaleTpl').innerHTML;

        return scale;
    },

    _buildScaleDom: function() {
        var root = document.createElement('div');
        var units = document.createElement('div');
        units.className = 'units';
        root.appendChild(units);

        this._units = [];
        this._unitsLbls = [];

        for (var i = 0; i < 5; i++) {
            var unit = L.DomUtil.create('div', 'unit');
            units.appendChild(unit);
            this._units.push(unit);

            if (i===0) {
                this._zeroLbl = L.DomUtil.create('div', 'label zeroLabel');
                unit.appendChild(this._zeroLbl);
            }

            var unitLbl = L.DomUtil.create('div', 'label unitLabel');
            unit.appendChild(unitLbl);
            this._unitsLbls.push(unitLbl);

            var l1 = L.DomUtil.create('div', 'line');
            unit.appendChild( l1 );

            var l2 = L.DomUtil.create('div', 'line2');
            unit.appendChild( l2 );

            if (i%2 === 0) l1.appendChild( L.DomUtil.create('div', 'fill') );
            if (i%2 === 1) l2.appendChild( L.DomUtil.create('div', 'fill') );

        }

        return root;
    },


    _update: function () {
        var bounds = this._map.getBounds(),
            centerLat = bounds.getCenter().lat,
            //length of an half world arc at current lat
            halfWorldMeters = 6378137 * Math.PI * Math.cos(centerLat * Math.PI / 180),
            //length of this arc from map left to map right
            dist = halfWorldMeters * (bounds.getNorthEast().lng - bounds.getSouthWest().lng) / 180,
            size = this._map.getSize();

        if (size.x > 0) {
            this._updateScale(dist, this.options);
        }


    },

    _updateScale: function(maxMeters, options) {
        
        var scale = this._getBestScale(maxMeters, options.minUnitWidth, options.maxUnitsWidth);

        this._render(scale.unit.unitPx, scale.numUnits, scale.unit.unitMeters);

    },

    _getBestScale: function(maxMeters, minUnitWidthPx, maxUnitsWidthPx) {

        //favor full units (not 500, 25, etc)
        //favor multiples in this order: [3, 2, 5, 4]
        //units should have a minUnitWidth
        //full scale width should be below maxUnitsWidth
        //full scale width should be above minUnitsWidth ?

        var possibleUnits = this._getPossibleUnits( maxMeters, minUnitWidthPx, this._map.getSize().x );

        var possibleScales = this._getPossibleScales(possibleUnits, maxUnitsWidthPx);

        possibleScales.sort(function(scaleA, scaleB) {
            return scaleB.score - scaleA.score;
        });

        return possibleScales[0];
    },

    _getPossibleScales: function(possibleUnits, maxUnitsWidthPx) {
        var scales = [];
        for (var i = 0; i < this._possibleUnitsNumLen; i++) {
            var numUnits = this._possibleUnitsNum[i];
            var numUnitsScore = (this._possibleUnitsNumLen-i)*0.5;
            
            for (var j = 0; j < possibleUnits.length; j++) {
                var unit = possibleUnits[j];
                var totalWidthPx = unit.unitPx * numUnits;
                if (totalWidthPx < maxUnitsWidthPx) {

                    var totalWidthPxScore = 1-(maxUnitsWidthPx - totalWidthPx) / maxUnitsWidthPx;
                    totalWidthPxScore *= 3;

                    var score = unit.unitScore + numUnitsScore + totalWidthPxScore;

                    //penalty when unit / numUnits association looks weird
                    if ( 
                        unit.unitDivision === 0.25 && numUnits === 3 ||
                        unit.unitDivision === 0.5 && numUnits === 3 ||
                        unit.unitDivision === 0.25 && numUnits === 5
                        ) {
                        score -= 2;
                    }

                    scales.push({
                        unit: unit,
                        totalWidthPx: totalWidthPx,
                        numUnits: numUnits,
                        score: score
                    });
                }
            }
        }

        return scales;
    },

    _getPossibleUnits: function(maxMeters, minUnitWidthPx, mapWidthPx) {
        var exp = (Math.floor(maxMeters) + '').length;

        var unitMetersPow;
        var units = [];

        for (var i = exp; i > 0; i--) {
            unitMetersPow = Math.pow(10, i);

            for (var j = 0; j < this._possibleDivisionsLen; j++) {
                var unitMeters = unitMetersPow * this._possibleDivisions[j];
                var unitPx = mapWidthPx * (unitMeters/maxMeters);

                if (unitPx < minUnitWidthPx) {
                    return units;
                }

                units.push({
                    unitMeters: unitMeters, 
                    unitPx: unitPx, 
                    unitDivision: this._possibleDivisions[j],
                    unitScore: this._possibleDivisionsLen-j });

            }
        }
    },

    _render: function(unitWidthPx, unitsMultiple, unitMeters) {

        var displayUnit = (unitMeters<1000) ? 'm' : 'km';
        var unitLength = unitMeters;
        if (displayUnit === 'km') unitLength /= 1000;


        this._zeroLbl.innerHTML = '0' + displayUnit; 

        for (var i = 0; i < this._units.length; i++) {
            var u = this._units[i];
            var lbl = this._unitsLbls[i];
            var lblClassNames = ['label', 'unitLabel'];

            if (i < unitsMultiple) {
                u.style.width = unitWidthPx + 'px';
                u.className = 'unit';
        
                var lblText  = ( (i+1)*unitLength );

                if (i === unitsMultiple-1) {
                    lblText += displayUnit;
                    lblClassNames.push('labelLast');
                } else {
                    lblClassNames.push('labelSub');
                }
                lbl.innerHTML = lblText;
            } else {
                u.style.width = 0;
                u.className = 'unit hidden';
            }

            lbl.className = lblClassNames.join(' ');

        }
    },

});

L.Map.mergeOptions({
    graphicScaleControl: false
});


L.Map.addInitHook(function () {
    if (this.options.graphicScaleControl) {
        this.graphicScaleControl = new L.Control.GraphicScale();
        this.addControl(this.graphicScaleControl);
    }
});

L.control.graphicScale = function (options) {
    return new L.Control.GraphicScale(options);
};
