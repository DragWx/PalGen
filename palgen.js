/* Copyright (C) 2018 DragWx <https://github.com/DragWx>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * This software is provided 'as-is', without any express or implied warranty.
 * In no event will the author(s) be held liable for any damages arising from
 * the use of this software.
 ****/

var appwindow;      // DOM element for the app's container
var palette = [];	// DOM element + metadata for each entry in the palette
var ciegraph;       // 2D context for ciegraph
var dpRatio = window.devicePixelRatio || 1;		// DPI Scaling
var graphX = 120 * dpRatio;   // Center X
var graphY = 180 * dpRatio;   // Center Y
var graphW = 300 * dpRatio;   // Width
var graphH = 300 * dpRatio;   // Height
var graphScale = 400 * dpRatio;   // Scale factor
var saveLink;       // DOM element for the save link

// Colorimetry presets.
// [Rx, Ry, Gx, Gy, Bx, By, Wx, Wy]
var colorimetryPresets = [
    [.67,  .33,  .21,  .71,  .14,  .08,  .31,   .316],  // FCC
    [.63,  .34,  .31,  .595, .155, .07,  .3127, .329],  // SMPTE C
    [.64,  .33,  .3,   .6,   .15,  .06,  .3127, .329],  // sRGB
    [.67,  .33,  .21,  .71,  .14,  .08,  .3127, .329]   // FCC D65
]
// White point presets.
// [Name, Wx, Wy]
var colorimetryWhitePointPresets = [
    ["C",     .31,   .316],
    ["D50",   .3457, .3585],
    ["D55",   .3324, .3474],
    ["D65",   .3127, .3290],
    ["D75",   .2990, .3148],
    ["9300K", .2849, .2932]
]
// Define entry point for the script.
window.onload = app_initialize;

// Initialize variables and create the UI of the app.
function app_initialize() {
    // Get the DOM element for the app's container.
    appwindow = document.getElementById('app');
    
    // Create the palette display by using a bunch of DIV elements.
    var palettetable = document.createElement('div');
    palettetable.style.width = "1024px";
    palettetable.style.height = "256px";
    palettetable.style.fontFamily = "monospace";
    palettetable.style.fontSize = "8pt";
    palettetable.style.fontWeight = "bold";
    
    // Create four rows.
    for (var lum = 0; lum < 4; lum++) {
        var newRow = document.createElement('div');
        newRow.style.height = (100/4) + "%";
        
        // For each row, create 16 cells.
        for (var hue = 0; hue < 16; hue++) {
            var newSquare = document.createElement('div');
            palette[hue + (lum * 16)] = newSquare;
            newSquare.style.display = "inline-block";
            newSquare.style.width = (100/16) + "%";
            newSquare.style.height = "100%";
            newSquare.style.background = "#000";
            newSquare.style.color = "#FFF";
            newRow.appendChild(newSquare);
        }
        palettetable.appendChild(newRow);
    }
    appwindow.appendChild(palettetable);
    
    // Create document.paletteTweaks
    var temp = document.createElement('form');
    temp.name = "paletteTweaks";
    appwindow.appendChild(temp);
    
    // CIE Graph pane caption
    var currLegend = document.createElement('legend');
    currLegend.title = "White point is origin, dots are colors, boxes are out-of-gamut colors."
    // A toggle checkbox to expand/collapse this pane
    temp = document.createElement('input');
    temp.type = "checkbox";
    temp.id = "showciegraph";
    temp.checked = "checked";
    temp.onclick = toggleGraph;
    currLegend.appendChild(temp);    // Add checkbox to legend.
    // Label for checkbox, serves as pane caption.
    temp = document.createElement("label");
    temp.innerHTML = "CIE Graph";
    temp.htmlFor = "showciegraph";
    currLegend.appendChild(temp);    // Add label to legend.
    temp = currLegend;   // = legend, containing checkbox and label

    // CIE Graph pane
    var currPane = document.createElement('fieldset');
    currPane.appendChild(temp);    // Add legend to pane.
    document.paletteTweaks.appendChild(currPane);

    // CIE Graph canvas (what the graph itself is drawn onto)
    temp = document.createElement('canvas');
    temp.width = graphW;
    temp.height = graphH;
    temp.style.width = graphW/dpRatio + "px";
    temp.style.height = graphH/dpRatio + "px";
    ciegraph = temp.getContext("2d");
    temp.id = "ciegraph";
    currPane.appendChild(temp);    // Add graph to pane.
    
    // Clipping pane
    currPane = document.createElement('fieldset');
    temp = document.createElement('legend');
    temp.innerHTML = "Clipping Style";
    currPane.appendChild(temp);    // Add legend to pane.
    document.paletteTweaks.appendChild(currPane);
    
    // Macro for creating a clipping option.
    var newClipOption = function (pane, groupName, idName, value, selected, caption, title) {
        var radio = document.createElement('input');
        radio.type = "radio";
        radio.name = groupName;
        radio.id = idName + "" + value;
        radio.value = value;
        if (selected === true)
            radio.checked = "checked";
        radio.onclick = generatePalette;
        pane.appendChild(radio);
        var label = document.createElement('label');
        label.innerHTML = caption;
        label.htmlFor = radio.id;
        label.title = title;
        pane.appendChild(label);
    }

    // Add the clipping options.
    newClipOption(currPane, "clipMethod", "clip", "0", false,
        "Clamp", "If a channel is out of range (> 255), it's clipped to 255. This may change hue, saturation, and/or lightness.");
    
    currPane.appendChild(document.createElement('br'));
    newClipOption(currPane, "clipMethod", "clip", "1", false,
        "Darken", "If any channels are out of range, the color is darkened until it is completely in range.");
        
    // The commented-out stuff was commented out for not being very good. #ObjectiveOpinions
    /*currPane.appendChild(document.createElement('br'));
    newClipOption(currPane, "clipMethod", "clip", "2", false,
        "Scale", "If any channels are out of range, the range between the darkest channel and lightest channel is linearly scaled down until the lightest channel is in range.");*/

    currPane.appendChild(document.createElement('br'));
    newClipOption(currPane, "clipMethod", "clip", "3", true,
        "Desaturate", "If any channels are out of range, the color is desaturated towards the luminance it would've had.");
        
    /*currPane.appendChild(document.createElement('br'));
    newClipOption(currPane, "clipMethod", "clip", "4", false,
        "Hue/Lum preserve", "If any channels are out of range, the color is desaturated until it is completely in range.");*/

    currPane.appendChild(document.createElement('hr'));
    currPane.appendChild(document.createTextNode('YIQ \u2192 RGB'));
    currPane.appendChild(document.createElement('br'));
    
    newClipOption(currPane, "clipMethodB", "clipb", "3", false,
        "None", "The RGB signal from the YIQ->RGB conversion is not clipped. WARNING: Gamma correction will break on some colors.");

    currPane.appendChild(document.createElement('br'));
    newClipOption(currPane, "clipMethodB", "clipb", "0", false,
        "Clamp", "This is applied right after the YIQ->RGB conversion, before the colorimetry is applied.");

    currPane.appendChild(document.createElement('br'));
    newClipOption(currPane, "clipMethodB", "clipb", "1", true,
        "Darken", "This is applied right after the YIQ->RGB conversion, before the colorimetry is applied.");
            
    currPane.appendChild(document.createElement('br'));
    newClipOption(currPane, "clipMethodB", "clipb", "2", false,
        "Desaturate", "This is applied right after the YIQ->RGB conversion, before the colorimetry is applied.");
    
    // Tuning pane
    currPane = document.createElement('fieldset');
    temp = document.createElement('legend');
    temp.innerHTML = "Tuning";
    currPane.appendChild(temp);
    document.paletteTweaks.appendChild(currPane);
    
    currPane.appendChild(makeFancyRangeBox("hue"));
    currPane.appendChild(document.createTextNode("Hue"));
    currPane.appendChild(document.createElement("br"));
    
    currPane.appendChild(makeFancyRangeBox("sat"));
    currPane.appendChild(document.createTextNode("Sat"));
    currPane.appendChild(document.createElement("br"));

    currPane.appendChild(makeFancyRangeBox("bri"));
    currPane.appendChild(document.createTextNode("Bri"));
    currPane.appendChild(document.createElement("br"));

    currPane.appendChild(makeFancyRangeBox("con"));
    currPane.appendChild(document.createTextNode("Con"));
    currPane.appendChild(document.createElement("br"));

    currPane.appendChild(makeFancyRangeBox("gam"));
    currPane.appendChild(document.createTextNode("Gam"));

    // Defaults for tuning pane.
    document.paletteTweaks.hue.value = "-0.25";
    document.paletteTweaks.sat.value = "0.7";
    document.paletteTweaks.bri.value = "-0.2";
    document.paletteTweaks.con.value = "1.2";
    document.paletteTweaks.gam.value = "1.0";
    // Apply this after the defaults to prevent spurious calls.
    document.paletteTweaks.hue.onchange = generatePalette;
    document.paletteTweaks.sat.onchange = generatePalette;
    document.paletteTweaks.bri.onchange = generatePalette;
    document.paletteTweaks.con.onchange = generatePalette;
    document.paletteTweaks.gam.onchange = generatePalette;

    currPane.appendChild(document.createElement("hr"));
    currPane.appendChild(document.createTextNode("Range"));
    currPane.appendChild(document.createElement("br"));

    // I range and Q range aren't a huge mystery; if you look at the matrix that converts RGB to YIQ,
    // the maximum value you can generate for I and for Q using valid RGB values is what irange and
    // qrange are.
    currPane.appendChild(makeFancyRangeBox("irange"));
    currPane.appendChild(document.createTextNode("I"));
    currPane.appendChild(document.createElement("br"));

    currPane.appendChild(makeFancyRangeBox("qrange"));
    currPane.appendChild(document.createTextNode("Q"));
    currPane.appendChild(document.createElement("br"));

    document.paletteTweaks.irange.value = "0.599";
    document.paletteTweaks.qrange.value = "0.525";
    document.paletteTweaks.irange.onchange = generatePalette;
    document.paletteTweaks.qrange.onchange = generatePalette;

    // View pane
    currPane = document.createElement('fieldset');
    temp = document.createElement('legend');
    temp.innerHTML = "View";
    currPane.appendChild(temp);
    document.paletteTweaks.appendChild(currPane);

    var newViewOption = function (pane, id, selected, caption) {
        var checkbox = document.createElement('input');
        checkbox.type = "checkbox";
        checkbox.id = id;
        if (selected === true)
            checkbox.checked = "checked";
        checkbox.onclick = generatePalette;
        pane.appendChild(checkbox);
        var label = document.createElement('label');
        label.innerHTML = caption;
        label.htmlFor = id;
        pane.appendChild(label);
    }

    newViewOption(currPane, "enablered", true, "Red");

    currPane.appendChild(document.createElement('br'));
    newViewOption(currPane, "enablegreen", true, "Green");

    currPane.appendChild(document.createElement('br'));
    newViewOption(currPane, "enableblue", true, "Blue");

    currPane.appendChild(document.createElement('br'));
    newViewOption(currPane, "grayscale", false, "Grayscale");

    currPane.appendChild(document.createElement('br'));
    newViewOption(currPane, "showtext", false, "Text");


    // Colorimetry pane
    currPane = document.createElement('fieldset');
    temp = document.createElement('legend');
    temp.innerHTML = "Colorimetry";
    currPane.appendChild(temp);
    document.paletteTweaks.appendChild(currPane);

    var newColorimetryOption = function (pane, value, selected, caption, title) {
        var radio = document.createElement('input');
        radio.type = "radio";
        radio.name = "colorimetry";
        radio.id = "clrm" + value;
        radio.value = value;
        if (selected === true)
            radio.checked = "checked";
        radio.onclick = function () {
            if (value == "4") {
                document.paletteTweaks.sendToCustom.disabled = true;
            } else {
                document.paletteTweaks.sendToCustom.disabled = false;
            }
            generatePalette();
        }
        pane.appendChild(radio);
        var label = document.createElement('label');
        label.innerHTML = caption;
        label.htmlFor = radio.id;
        label.title = title;
        pane.appendChild(label);
    }

    newColorimetryOption(currPane, "0", false,
        "FCC (1953)", "Original FCC standard for the color of the phosphors.");

    currPane.appendChild(document.createElement('br'));
    newColorimetryOption(currPane, "3", true,
        "FCC D65", "Original FCC standard, but with D65 as the white point.");

    currPane.appendChild(document.createElement('br'));
    newColorimetryOption(currPane, "1", false,
        "SMPTE C (1987)", "A newer standard for the color of the phospors. (Not used in Japan)");

    currPane.appendChild(document.createElement('br'));
    newColorimetryOption(currPane, "2", false,
        "sRGB (PC Monitors)", "The colorimetry used in PC monitors, like the one you're (probably) looking at right now.");

    currPane.appendChild(document.createElement('br'));
    newColorimetryOption(currPane, "4", false,
        "Custom", "Input your own colorimetry.");

    currPane.appendChild(document.createElement('hr'));
    temp = document.createElement('input');
    temp.id = "sendToCustom";
    temp.type = "button";
    temp.value = "Send current to custom";
    temp.onclick = function() {
        var colorimetry;
        for (i = 0; i < document.paletteTweaks.colorimetry.length; i++) {
            if (document.paletteTweaks.colorimetry[i].checked) {
                colorimetry = parseInt(document.paletteTweaks.colorimetry[i].value);
                break;
            }
        }
        document.paletteTweaks.custRx.value = colorimetryPresets[colorimetry][0];
        document.paletteTweaks.custRy.value = colorimetryPresets[colorimetry][1];
        document.paletteTweaks.custGx.value = colorimetryPresets[colorimetry][2];
        document.paletteTweaks.custGy.value = colorimetryPresets[colorimetry][3];
        document.paletteTweaks.custBx.value = colorimetryPresets[colorimetry][4];
        document.paletteTweaks.custBy.value = colorimetryPresets[colorimetry][5];
        document.paletteTweaks.custWx.value = colorimetryPresets[colorimetry][6];
        document.paletteTweaks.custWy.value = colorimetryPresets[colorimetry][7];
        tweakMatrix();
        
        document.paletteTweaks.colorimetry[4].checked = true;
        document.paletteTweaks.colorimetry[4].onclick();
    };
    currPane.appendChild(temp);

    // Custom Colorimetry pane
    currPane = document.createElement('fieldset');
    temp = document.createElement('legend');
    temp.innerHTML = "Custom";
    currPane.appendChild(temp);
    document.paletteTweaks.appendChild(currPane);
    
    currPane.appendChild(makeFancyRangeBox("custRx", 10));
    currPane.appendChild(document.createTextNode("Rx"));
    currPane.appendChild(document.createElement("br"));
    currPane.appendChild(makeFancyRangeBox("custRy", 10));
    currPane.appendChild(document.createTextNode("Ry"));
    currPane.appendChild(document.createElement("br"));

    currPane.appendChild(makeFancyRangeBox("custGx", 10));
    currPane.appendChild(document.createTextNode("Gx"));
    currPane.appendChild(document.createElement("br"));
    currPane.appendChild(makeFancyRangeBox("custGy", 10));
    currPane.appendChild(document.createTextNode("Gy"));
    currPane.appendChild(document.createElement("br"));

    currPane.appendChild(makeFancyRangeBox("custBx", 10));
    currPane.appendChild(document.createTextNode("Bx"));
    currPane.appendChild(document.createElement("br"));
    currPane.appendChild(makeFancyRangeBox("custBy", 10));
    currPane.appendChild(document.createTextNode("By"));
    currPane.appendChild(document.createElement("br"));

    currPane.appendChild(makeFancyRangeBox("custWx", 10));
    currPane.appendChild(document.createTextNode("Wx"));
    currPane.appendChild(document.createElement("br"));
    currPane.appendChild(makeFancyRangeBox("custWy", 10));
    currPane.appendChild(document.createTextNode("Wy"));

    document.paletteTweaks.custRx.onchange = tweakMatrix;
    document.paletteTweaks.custRy.onchange = tweakMatrix;
    document.paletteTweaks.custGx.onchange = tweakMatrix;
    document.paletteTweaks.custGy.onchange = tweakMatrix;
    document.paletteTweaks.custBx.onchange = tweakMatrix;
    document.paletteTweaks.custBy.onchange = tweakMatrix;
    document.paletteTweaks.custWx.onchange = tweakMatrix;
    document.paletteTweaks.custWy.onchange = tweakMatrix;

    currPane.appendChild(document.createElement("hr"));
    currPane.appendChild(document.createTextNode("Quick White Points"));
    currPane.appendChild(document.createElement("br"));

    // White point presets
    var newWhitePointPreset = function (pane, value, caption) {
        var radio = document.createElement('input');
        radio.type = "radio";
        radio.name = "whitePointPreset";
        radio.id = "wpp" + value;
        radio.value = value;
        radio.onclick = function () {
            document.paletteTweaks.custWx.value = colorimetryWhitePointPresets[parseInt(value)][1];
            document.paletteTweaks.custWy.value = colorimetryWhitePointPresets[parseInt(value)][2];
            generatePalette();
        }
        pane.appendChild(radio);
        var label = document.createElement('label');
        label.innerHTML = caption;
        label.htmlFor = radio.id;
        pane.appendChild(label);
    }
    for (var i = 0; i < colorimetryWhitePointPresets.length; i++) {
        if (i > 0)
            currPane.appendChild(document.createElement("br"));
        newWhitePointPreset(currPane, i, colorimetryWhitePointPresets[i][0]);
    }

    appwindow.appendChild(document.createElement('br'));
    saveLink = document.createElement('a');
    saveLink.style.display = "none";
    //saveLink.innerHTML = "[Save palette...]";
    saveLink.href = "#";
    saveLink.download = "nespalette.pal";
    appwindow.appendChild(saveLink);

    temp = document.createElement("button");
    temp.innerHTML = "Save palette..."
    temp.onclick = function() {
        saveLink.click();
    };
    appwindow.appendChild(temp);

    generatePalette();
}
// Create an input box with [-] and [+] buttons.
// buttonStep is actually fixed point (1000 = 1.0f) to avoid rounding shenanigans.
function makeFancyRangeBox(name, buttonStep) {
    if (buttonStep === undefined)
        buttonStep = 50;
    var temp = document.createElement('div');
    temp.style.display = "inline-flex";
    temp.style.flexDirection = "row";
    
    var valueBox = document.createElement('input');
    valueBox.type = "number";
    valueBox.id = name;
    valueBox.name = name;
    valueBox.size = "5";
    valueBox.step = "0.0001";
    valueBox.style.width = "5em";

    var minusButton = document.createElement('input');
    minusButton.type = "button";
    minusButton.value = "-";
    minusButton.onclick = function() {
        valueBox.value = (Math.round(parseFloat(valueBox.value) * 1000) - buttonStep) / 1000;
        valueBox.onchange();
    }
    minusButton.style.width = "32px";

    var plusButton = document.createElement('input');
    plusButton.type = "button";
    plusButton.value = "+";
    plusButton.onclick = function() {
        valueBox.value = (Math.round(parseFloat(valueBox.value) * 1000) + buttonStep) / 1000;
        valueBox.onchange();
    }
    plusButton.style.width = "32px";

    temp.appendChild(minusButton);
    temp.appendChild(valueBox);
    temp.appendChild(plusButton);
    return temp;
}
// Runs whenever the custom colorimetry parameters are tweaked by the user.
function tweakMatrix() {
    // See if the entered white point matches a preset. If it does, select the
    // option which represents it.
    for (var i = 0; i < colorimetryWhitePointPresets.length; i++) {
        if (parseFloat(document.paletteTweaks.custWx.value) == colorimetryWhitePointPresets[i][1] &&
            parseFloat(document.paletteTweaks.custWy.value) == colorimetryWhitePointPresets[i][2]) {
            document.paletteTweaks.whitePointPreset[i].checked = "checked";
        } else {
            document.paletteTweaks.whitePointPreset[i].checked = false;
        }
    }
    // Figure out which colorimetry is selected.
     var colorimetry;
    for (i = 0; i < document.paletteTweaks.colorimetry.length; i++) {
        if (document.paletteTweaks.colorimetry[i].checked) {
            colorimetry = document.paletteTweaks.colorimetry[i].value;
            break;
        }
    }
    // Only generate palette if the custom one is selected.
    if (colorimetry == "4")
        generatePalette();
}
function toggleGraph() {
    if (document.paletteTweaks.showciegraph.checked) {
        document.getElementById("ciegraph").style.display = "";
    } else {
        document.getElementById("ciegraph").style.display = "none";
    }
}
// Colors [00, 10, 20, 30, 0D, 1D, 2D, 3D]
var luminances = [0.397, 0.681, 1, 1, -0.117, 0, 0.308, 0.715];
// Generate the NES palette using the parameters entered on the UI.
// (This is probably what you're here for)
function generatePalette() {
    var colorimetry;
    for (i = 0; i < document.paletteTweaks.colorimetry.length; i++) {
        if (document.paletteTweaks.colorimetry[i].checked) {
            colorimetry = parseInt(document.paletteTweaks.colorimetry[i].value);
            break;
        }
    }
    switch (colorimetry) {
    case 4:
        updateMatrix(
            document.paletteTweaks.custRx.value,
            document.paletteTweaks.custRy.value,
            document.paletteTweaks.custGx.value,
            document.paletteTweaks.custGy.value,
            document.paletteTweaks.custBx.value,
            document.paletteTweaks.custBy.value,
            document.paletteTweaks.custWx.value,
            document.paletteTweaks.custWy.value);
        break;
    default:
        updateMatrix(
            colorimetryPresets[colorimetry][0],
            colorimetryPresets[colorimetry][1],
            colorimetryPresets[colorimetry][2],
            colorimetryPresets[colorimetry][3],
            colorimetryPresets[colorimetry][4],
            colorimetryPresets[colorimetry][5],
            colorimetryPresets[colorimetry][6],
            colorimetryPresets[colorimetry][7]);
        break;
    }

    // Clear the graph and draw the axis lines.
    ciegraph.fillStyle = "#000";
    ciegraph.fillRect(0,0,graphW,graphH);
    ciegraph.strokeStyle = "#444";
    ciegraph.lineWidth = 0.5 * dpRatio;
    ciegraph.beginPath();
    ciegraph.moveTo(0,graphY);
    ciegraph.lineTo(graphW,graphY);
    ciegraph.moveTo(graphX,0);
    ciegraph.lineTo(graphX,graphH);
    ciegraph.stroke();
    
    // Draw the gamut triangle.
    ciegraph.beginPath();
    ciegraph.lineWidth = 0.5 * dpRatio;
    ciegraph.strokeStyle = "#222";
    ciegraph.moveTo(((convCoords[0]-convCoords[6]) * graphScale)+graphX,((convCoords[1]-convCoords[7]) * -graphScale)+graphY);
    ciegraph.lineTo(((convCoords[2]-convCoords[6]) * graphScale)+graphX,((convCoords[3]-convCoords[7]) * -graphScale)+graphY);
    ciegraph.lineTo(((convCoords[4]-convCoords[6]) * graphScale)+graphX,((convCoords[5]-convCoords[7]) * -graphScale)+graphY);
    ciegraph.closePath();
    ciegraph.stroke();

    var hueAdj = parseFloat(document.paletteTweaks.hue.value);
    var satAdj = parseFloat(document.paletteTweaks.sat.value);
    var bri = parseFloat(document.paletteTweaks.bri.value);
    var con = parseFloat(document.paletteTweaks.con.value);
    var irange = parseFloat(document.paletteTweaks.irange.value);
    var qrange = parseFloat(document.paletteTweaks.qrange.value);
    var textEnable = false;
    if (document.paletteTweaks.showtext.checked) textEnable = true;
    for (var lum = 0; lum < 4; lum++) {
        // Generate colors x0 and xD for the current luminance.
        var low = (luminances[lum + 4] * con) + bri;
        var high = (luminances[lum] * con) + bri;

        // Color x0
        var color = yiqToRgb(high, 0, 0);
        palette[(lum * 16)].style.background = "#"+color.R+color.G+color.B;
        if (textEnable)
            palette[(lum * 16)].innerHTML = color.R+"<br>"+color.G+"<br>"+color.B;
        else
            palette[(lum * 16)].innerHTML = "";
        palette[(lum * 16)].R = color.R;
        palette[(lum * 16)].G = color.G;
        palette[(lum * 16)].B = color.B;
        
        // Color xD
        color = yiqToRgb(low, 0, 0);
        palette[(lum * 16) + 13].style.background = "#"+color.R+color.G+color.B;
        if (textEnable)
            palette[(lum * 16) + 13].innerHTML = color.R+"<br>"+color.G+"<br>"+color.B;
        else
            palette[(lum * 16) + 13].innerHTML = "";
        palette[(lum * 16) + 13].R = color.R;
        palette[(lum * 16) + 13].G = color.G;
        palette[(lum * 16) + 13].B = color.B;

        // If we just generated color 1D, copy it to columns E and F.
        if (lum == 1) {
            palette[14].style.background = "#"+color.R+color.G+color.B;
            palette[15].style.background = "#"+color.R+color.G+color.B;
            palette[30].style.background = "#"+color.R+color.G+color.B;
            palette[31].style.background = "#"+color.R+color.G+color.B;
            palette[46].style.background = "#"+color.R+color.G+color.B;
            palette[47].style.background = "#"+color.R+color.G+color.B;
            palette[62].style.background = "#"+color.R+color.G+color.B;
            palette[63].style.background = "#"+color.R+color.G+color.B;
        }

        // Generate colors x1 to xC for the current luminance.
        for (var hue = 0; hue < 12; hue++) {
            var Y = (low + high) / 2;
            var sat = luminances[lum] - luminances[lum + 4];
            sat *= satAdj * con;
            //Colorburst amplitude = -0.208 ~ 0.286 = 0.494
            //Colorburst bias = 0.039
            // Hue 8 is used as colorburst. Colorburst is 2.5656 radians.
            var I = Math.sin((((hue - 7) / 12) * 6.2832)+2.5656+hueAdj) * irange;
            var Q = Math.cos((((hue - 7) / 12) * 6.2832)+2.5656+hueAdj) * qrange;
            // Apply saturation setting
            I *= sat;
            Q *= sat;

            var color = yiqToRgb(Y,I,Q);
            palette[hue + (lum * 16) + 1].style.background = "#"+color.R+color.G+color.B;
            var temp = ""
            if (textEnable) {
                temp = color.R+"<br>"+color.G+"<br>"+color.B;
                if (color.ovr)
                    temp = temp + "<br>ovr";
            }
            palette[hue + (lum * 16) + 1].innerHTML = temp;
            palette[hue + (lum * 16) + 1].R = color.R;
            palette[hue + (lum * 16) + 1].G = color.G;
            palette[hue + (lum * 16) + 1].B = color.B;
        }
    }
    // Build the binary  version of the palette for download.
    var binPal = "";
    for (var i = 0; i < 64; i++) {
        if (i % 16 >= 14) {
            // Columns E and F all mirror color 1D (black)
            binPal += "%" + palette[29].R;
            binPal += "%" + palette[29].G;
            binPal += "%" + palette[29].B;
        } else {
            binPal += "%" + palette[i].R;
            binPal += "%" + palette[i].G;
            binPal += "%" + palette[i].B;
        }
    }
    saveLink.href = "data:application/octet-stream," + binPal;
}
var convMatrix = [0,0,0,0,0,0,0,0,0];
var convCoords = [0,0,0,0,0,0,0,0];
// Generate a translation matrix which will be used to convert from 
// YIQ->RGB to XYZ. The idea here is to allow the user to specify what physical
// color the phosphors of the simulated TV are.
function updateMatrix(Rpx,Rpy,Gpx,Gpy,Bpx,Bpy,Wpx,Wpy) {
    convCoords = [Rpx,Rpy,Gpx,Gpy,Bpx,Bpy,Wpx,Wpy];
    //http://www.brucelindbloom.com/Eqn_RGB_XYZ_Matrix.html
    //http://www.dr-lex.be/random/matrix_inv.html
    // Convert the (x,y) values to X Y Z.
    var Xr = Rpx / Rpy;
    var Xg = Gpx / Gpy;
    var Xb = Bpx / Bpy;
    var Xw = Wpx / Wpy;
    var Yr = 1;
    var Yg = 1;
    var Yb = 1;
    var Yw = 1;
    var Zr = (1 - Rpx - Rpy) / Rpy;
    var Zg = (1 - Gpx - Gpy) / Gpy;
    var Zb = (1 - Bpx - Bpy) / Bpy;
    var Zw = (1 - Wpx - Wpy) / Wpy;

    // Get ready for a bunch of painful math. I need to invert a matrix, then multiply it by a vector.
    // Determinant for inverse matrix
    var sDet = (Xr*((Zb*Yg)-(Zg*Yb)))-(Yr*((Zb*Xg)-(Zg*Xb)))+(Zr*((Yb*Xg)-(Yg*Xb)));
    
    var Sr = ((((Zb*Yg)-(Zg*Yb))/sDet)*Xw) + ((-((Zb*Xg)-(Zg*Xb))/sDet)*Yw) + ((((Yb*Xg)-(Yg*Xb))/sDet)*Zw);
    var Sg = ((-((Zb*Yr)-(Zr*Yb))/sDet)*Xw) + ((((Zb*Xr)-(Zr*Xb))/sDet)*Yw) + ((-((Yb*Xr)-(Yr*Xb))/sDet)*Zw);
    var Sb = ((((Zg*Yr)-(Zr*Yg))/sDet)*Xw) + ((-((Zg*Xr)-(Zr*Xg))/sDet)*Yw) + ((((Yg*Xr)-(Yr*Xg))/sDet)*Zw);
    
    // This should be the completed RGB -> XYZ matrix.
    // Multiply the first three members by R, G, and B respectively, then add
    // them together to get X, for example.
    convMatrix[0] = Sr*Xr;
    convMatrix[1] = Sg*Xg;
    convMatrix[2] = Sb*Xb;
    convMatrix[3] = Sr*Yr;
    convMatrix[4] = Sg*Yg;
    convMatrix[5] = Sb*Yb;
    convMatrix[6] = Sr*Zr;
    convMatrix[7] = Sg*Zg;
    convMatrix[8] = Sb*Zb;
}
// Convert from YIQ to RGB, using the FCC's formula for the conversion.
// Clipping for both phases, as well as the XYZ conversions are performed here.
function yiqToRgb(Y,I,Q) {
    var gamma = parseFloat(document.paletteTweaks.gam.value);
    // XYZ->RGB clipping
    var clipMethod;
    for (i = 0; i < document.paletteTweaks.clipMethod.length; i++) {
        if (document.paletteTweaks.clipMethod[i].checked) {
            clipMethod = document.paletteTweaks.clipMethod[i].value;
            break;
        }
    }
    // YIQ->RGB clipping
    var clipMethodB;
    for (i = 0; i < document.paletteTweaks.clipMethodB.length; i++) {
        if (document.paletteTweaks.clipMethodB[i].checked) {
            clipMethodB = document.paletteTweaks.clipMethodB[i].value;
            break;
        }
    }
    // View options
    var rEnable = false, gEnable = false, bEnable = false;
    if (document.paletteTweaks.enablered.checked) rEnable = true;
    if (document.paletteTweaks.enablegreen.checked) gEnable = true;
    if (document.paletteTweaks.enableblue.checked) bEnable = true;
    var grayscale = false;
    if (document.paletteTweaks.grayscale.checked) grayscale = true;
    
    // This is the YIQ -> RGB formula as defined by the FCC. The calculations
    // for this are in the comments at the end of this script, just take the
    // result matrix and invert it and you should get this.
    var R = Y + (0.9469*I) + (0.6236*Q);
    var G = Y - (0.2748*I) - (0.6357*Q);
    var B = Y - (1.1085*I) + (1.709*Q);

    var corrected;
    // Apply desired clipping method to out-of-gamut colors.
    switch (clipMethodB) {
    default:
        corrected = clipClamp(R, G, B);
        break;
    case "1":
        corrected = clipDarken(R, G, B);
        break;
    case "2":
        corrected = clipDesaturate(R, G, B);
        break;
    }
    if (clipMethodB != 3) {
        R = corrected.r;
        G = corrected.g;
        B = corrected.b;
    }
    
    // This is the conversion matrix for CIEXYZ -> sRGB. I nicked this from:
    // http://www.brucelindbloom.com/Eqn_RGB_XYZ_Matrix.html
    // and I know it's right because when you use the sRGB colorimetry, this matrix produces identical results to
    // just using the raw R, G, and B above.

    // TODO: Provide multiple output colorimetries, not just sRGB.
    var xyztorgb = [3.2404, -1.5371, -0.4985, -0.9693, 1.876, 0.0416, 0.0556, -0.204, 1.0572];

    // Remove the disabled channels.
    if (!rEnable) R = 0;
    if (!gEnable) G = 0;
    if (!bEnable) B = 0;
    // If channels are negative, clamp them to 0. I'm pretty sure this is what TVs do.
    if (R < 0) R = 0;
    if (G < 0) G = 0;
    if (B < 0) B = 0;
        
    // Gamma correction.
    R = Math.pow(R, gamma);
    G = Math.pow(G, gamma);
    B = Math.pow(B, gamma);
    
    // Convert RGB to XYZ using the matrix generated with the specified RGB and W points.	
    X = (convMatrix[0] * R) + (convMatrix[1] * G) + (convMatrix[2] * B);
    Y = (convMatrix[3] * R) + (convMatrix[4] * G) + (convMatrix[5] * B);
    Z = (convMatrix[6] * R) + (convMatrix[7] * G) + (convMatrix[8] * B);

    // Convert back to RGB using the XYZ->sRGB matrix.
    R = (xyztorgb[0]*X) + (xyztorgb[1]*Y) + (xyztorgb[2]*Z);
    G = (xyztorgb[3]*X) + (xyztorgb[4]*Y) + (xyztorgb[5]*Z);
    B = (xyztorgb[6]*X) + (xyztorgb[7]*Y) + (xyztorgb[8]*Z);
    
    // Any negative channels are clamped to 0 again.
    if (R < 0) R = 0;
    if (G < 0) G = 0;
    if (B < 0) B = 0;

    // Convert to grayscale if that option's on.
    if (grayscale) {
        R = (.299 * R) + (0.587 * G) + (0.114 * B);
        G = R;
        B = R;
    }
    
    // Apply desired clipping method to out-of-gamut colors.
    switch (clipMethod) {
    case "1":
        corrected = clipDarken(R, G, B);
        break;
    case "2":	// Not used.
        corrected = clipScale(R, G, B);
        break;
    case "3":
        corrected = clipDesaturate(R, G, B);
        break;
    case "4":	// Not used.
        corrected = clipTargettedDesaturate(R, G, B, Y);
        break;
    default:
        corrected = clipClamp(R, G, B);
    }
    // Convert normalized value to the two-character hexadecimal representation.
    R = toColorHex(corrected.r);
    G = toColorHex(corrected.g);
    B = toColorHex(corrected.b);
    ovr = corrected.ovr;

    // Plot the resulting color on the CIE graph since we already have the coordinates and the RGB for it.
    // Why not? It's pretty.
    ciegraph.beginPath();
    ciegraph.strokeStyle = "#"+R+G+B;
    if (!ovr) {
        ciegraph.lineWidth = dpRatio * 2;
        ciegraph.rect((((X/(X+Y+Z))-convCoords[6]) * graphScale)+graphX-(.5*dpRatio),(((Y/(X+Y+Z))-convCoords[7]) * -graphScale)+graphY-(.5*dpRatio),dpRatio,dpRatio);
    } else {
        ciegraph.lineWidth = dpRatio * 0.5;
        ciegraph.rect((((X/(X+Y+Z))-convCoords[6]) * graphScale)+graphX-(1.5*dpRatio),(((Y/(X+Y+Z))-convCoords[7]) * -graphScale)+graphY-(1.5*dpRatio),3*dpRatio,3*dpRatio);
    }
    ciegraph.stroke();

    return {R: R, G: G, B: B, ovr: ovr};
}
function toColorHex(i) {
    var temp = Math.floor(i * 255);
    if (temp < 16)
        temp = "0"+temp.toString(16);
    else
        temp = temp.toString(16);
    return temp;
}
// Any channels > 1 get clamped to 1.
function clipClamp(r, g, b) {
    var ovr = false;
    if (r > 1) {
        r = 1;
        ovr = true;
    } else if (r < 0) {
        r = 0;
    }
    if (g > 1) {
        g = 1;
        ovr = true;
    } else if (g < 0) {
        g = 0;
    }
    if (b > 1) {
        b = 1;
        ovr = true;
    } else if (b < 0) {
        b = 0;
    }
    return {r: r, g: g, b: b, ovr: ovr};
}
// If any channels are > 1, luminance is decreased until all channels are
// in range (one channel will be 1).
function clipDarken(r, g, b) {
    var ovr = false;
    var ratio = 1;
    if ((r > 1) || (g > 1) || (b > 1)) {
        ovr = true;
        var max = r;
        if (g > max)
            max = g;
        if (b > max)
            max = b;
        ratio = 1 / max;
    }
    r *= ratio;
    g *= ratio;
    b *= ratio;
    if (r > 1) r = 1;
    else if (r < 0) r = 0;
    if (g > 1) g = 1;
    else if (g < 0) g = 0;
    if (b > 1) b = 1;
    else if (b < 0) b = 0;
    return {r: r, g: g, b: b, ovr: ovr};
}
// If any channels are > 1, the color is desaturated towards the darkest channel
// until all channels are in range.
function clipScale(r, g, b) {
    var ovr = false;
    var ratio = 1;
    if ((r > 1) || (g > 1) || (b > 1)) {
        ovr = true;
        var max = r;
        if (g > max) max = g;
        if (b > max) max = b;
        var min = r;
        if (g < min) min = g;
        if (b < min) min = b;
        ratio = 1 / max;
    }
    if (ovr) {
        r -= min;
        g -= min;
        b -= min;
        r *= ratio;
        g *= ratio;
        b *= ratio;
        r += min;
        g += min;
        b += min;
    }
    if (r > 1) r = 1;
    else if (r < 0) r = 0;
    if (g > 1) g = 1;
    else if (g < 0) g = 0;
    if (b > 1) b = 1;
    else if (b < 0) b = 0;
    return {r: r, g: g, b: b, ovr: ovr};
}
// If any channels are > 1, the color is desaturated towards the luminance it
// would've had, until all channels are in range.
function clipDesaturate(r, g, b) {
    l = (.299 * r) + (0.587 * g) + (0.114 * b);
    var ovr = false;
    var ratio = 1;
    if ((r > 1) || (g > 1) || (b > 1)) {
        ovr = true;
        var max = r;
        if (g > max) max = g;
        if (b > max) max = b;
        ratio = 1 / max;
    }
    if (ovr) {
        r -= l;
        g -= l;
        b -= l;
        r *= ratio;
        g *= ratio;
        b *= ratio;
        r += l;
        g += l;
        b += l;
    }
    if (r > 1) r = 1;
    else if (r < 0) r = 0;
    if (g > 1) g = 1;
    else if (g < 0) g = 0;
    if (b > 1) b = 1;
    else if (b < 0) b = 0;
    return {r: r, g: g, b: b, ovr: ovr};
}
// If any channels are > 1, the color is desaturated towards the provided
// luminance, until all channels are in range.
function clipTargettedDesaturate(r, g, b, l) {
    var ovr = false;
    var ratio = 1;
    if ((r > 1) || (g > 1) || (b > 1)) {
        ovr = true;
        var max = r;
        if (g > max) max = g;
        if (b > max) max = b;
        ratio = 1 / max;
    }
    if (ovr) {
        r -= l;
        g -= l;
        b -= l;
        r *= ratio;
        g *= ratio;
        b *= ratio;
        r += l;
        g += l;
        b += l;
    }
    if (r > 1) r = 1;
    else if (r < 0) r = 0;
    if (g > 1) g = 1;
    else if (g < 0) g = 0;
    if (b > 1) b = 1;
    else if (b < 0) b = 0;
    return {r: r, g: g, b: b, ovr: ovr};
}
/* Here's that YIQ -> RGB formula calculation I promised.

Y = 0.30R + 0.59G + 0.11B
I = -0.27(B-Y) + 0.74(R-Y)
Q = 0.41(B-Y) + 0.48(R-Y)

Y = (0.30R + 0.59G + 0.11B)
I = -0.27(-0.30R - 0.59G + 0.89B) + 0.74(0.70R - 0.59G - 0.11B)
Q = 0.41(-0.30R - 0.59G + 0.89B) + 0.48(0.70R - 0.59G - 0.11B)

Y = (0.30R + 0.59G + 0.11B)
I = (0.081R + 0.1593G + -0.2403B) + (0.518R - 0.4366G - 0.0814B)
Q = (-0.123R - 0.2419G + 0.3649B) + (0.336R - 0.2832G - 0.0528B)

Y = 0.30R + 0.59G + 0.11B
I = 0.599R -0.2773G -0.3217B
Q = 0.213R -0.5251G 0.3121B
*/
