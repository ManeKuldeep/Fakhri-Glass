Hi,

I want to create and android application for a glass vendor. 

The requiremnet is clear. The vendor want to track his invontory. With below fix major categories.

1. Clear Galss
2. Mirror Glass
3. Tinted Glass
4. Reflective Glass
5. Figure Class
6. Backpainted Glass 
7. Frosted Glass
8. Extra Clear Glass

Now these are further classified into below subcategories.

1. Figure Glass (Lining)
5mm Clear Moru
5mm Clear (reverse Moru)
5mm Clear Flute Lite
5mm Grey Moru
5mm Brown Moru
8mm Clear Moru
2. Backpainted Glass
4mm White B/P
6mm White B/P
3. Frosted Glass
4mm Frosted
5mm Frosted
4. Clear Glass
4mm
5mm
6mm
8mm
10mm
12mm
5. Mirror Glass
4mm Clear Mirror
5mm Clear Mirror
6mm Clear Mirror
4mm Extra Clear Mirror
5mm Extra Clear Mirror
6mm Extra Clear Mirror
5mm Grey Mirror
5mm Brown Mirror
5mm Rose Gold Mirror
6. Extra Clear Glass
4mm
5mm
6mm
8mm
10mm
12mm
7. Tinted Glass
4mm Grey Tinted
5mm Grey Tinted
4mm Brown Tinted
5mm Brown Tinted
8mm Brown Tinted
8mm Grey Tinted
10mm Brown
10mm Grey
12mm Brown
12mm Grey
8. Reflective Glass

Grey Reflective

3.5mm Grey Reflective
4mm Grey Reflective
5mm Grey Reflective

Brown Reflective

3.5mm Brown Reflective
4mm Brown Reflective
5mm Brown Reflective

Clear Reflective

3.5mm Clear Reflective
4mm Clear Reflective
5mm Clear Reflective

Note: please add a note for lining glass to put verticle line height in fixed input box. this will be very criticle in glass optimiser.

Now I want to create a mobile such that vendor can manage his inventory with ease. and while adding new inventory item the vendor should be able to enter the dimensions of the item in inventory.

Then second part will come for creating order page where vendor can enter order details like customer name, contact number, address, items ordered, quantity, price, total price, payment method, etc. 

The order items will be choosed from the above subcategoris with specific dimentions.
Eg. vendor will select a subcategory then enter the dimention in which he want a piece of glass.
there can be multiple pieces of same subcategory with different dimensions. So user can add multiple items in the order. 
and also more than 1 subcategory can be added in the order.

The app should be user friendly and easy to navigate. 

Now next step will be the order will go to the glass cutter application. Where he will see the order.
now to cut the glass the cutter require a glass optimiser. something like a visualiser how to cut the glass from the available inventory. 

Eg. suppose i have a piece of glass of 7 feet by 10 feet in inventory for a subcategory. and there is 1 order with same subcategory with 3 pieces. each piece of 300mm by 400mm.
Now in this scenat=rio the optimiser should be smart enough to track the best possible way to cut the glass from the available inventory. it should also check if the remaining glass from main piece will be used again or PushNotificationIOS. Based on the main category i can share more details and requirements.

for creating the optimiser there are some points to be considered.
1. The remaining glass should be tracked for future use.
2. The lining category glass sghould always be in verticle cut
3. The optimiser should be interactive to modify the position. 
4. If vendor want to move any peice on optimiser it should be doable. 
5. if vendor wants to cut the piece from new sheet that provision should also be there.
6. After confirm the optimiser the pieces should be marked as used or deducted from inventory.
7. also keep provsion to add max wastage consideration to make ptimiser/ visuaklizer more efficient.

Also there should be notification message on main screen for low inventory stock.

Give option to add dimentions in any unit mm, cm, inch, feets. And save all data in mm format in DB. Main thing to remember is all the values after decible should be in fractiion of 1/16. use below function to calculate

function convertToFractionalMM(value, fromUnit, precision = 16) {
    // 1. Convert input unit to decimal millimeters
    let mmDecimal = 0;
    switch(fromUnit.toLowerCase()) {
        case 'foot':
        case 'feet':
        case 'ft':
            mmDecimal = value * 304.8; // 1 foot = 304.8 mm
            break;
        case 'inch':
        case 'inches':
        case 'in':
            mmDecimal = value * 25.4;
            break;
        case 'cm':
            mmDecimal = value * 10;
            break;
        case 'm':
            mmDecimal = value * 1000;
            break;
        case 'mm':
            mmDecimal = value;
            break;
        default:
            throw new Error("Unsupported unit. Use 'feet', 'inch', 'cm', 'm', or 'mm'.");
    }

    // 2. Extract the whole millimeter value
    const wholeMM = Math.floor(mmDecimal);
    
    // 3. Extract the decimal remainder
    const remainder = mmDecimal - wholeMM;
    
    // 4. Calculate the closest numerator based on precision (e.g., 8 for 1/8ths)
    const numerator = Math.round(remainder * precision);
    
    // 5. Handle rounding up edge-case (e.g., 8/8 becomes +1 whole mm)
    let finalWhole = wholeMM;
    let finalNumerator = numerator;
    
    if (finalNumerator === precision) {
        finalWhole += 1;
        finalNumerator = 0;
    }
    
    // 6. Simplify the fraction if needed (Greatest Common Divisor)
    if (finalNumerator > 0) {
        const gcd = (a, b) => b ? gcd(b, a % b) : a;
        const divisor = gcd(finalNumerator, precision);
        finalNumerator /= divisor;
        const finalDenominator = precision / divisor;
        
        return `${finalWhole} ${finalNumerator}/${finalDenominator} mm`;
    }
    
    return `${finalWhole} mm`;
}

// --- Test Cases ---
// 0.098835 feet -> 30 1/8 mm (with precision set to 16)
console.log(convertToFractionalMM(0.098835, 'feet', 16)); // Output: "30 1/8 mm"

// 2.5 feet -> 762 mm
console.log(convertToFractionalMM(2.5, 'ft', 16));    


Now give me plan for this how should i proceed what techniology should be used and how it can be optimised to make the app faster and easy to use. give me a implmentation plan so that i can get this done in antigravity IDE.