$ErrorActionPreference = "Stop"

$base = "http://localhost:3200/api"
$now = Get-Date -Format "yyyyMMddHHmmss"

#pragma warning disable PSUseApprovedVerbs
function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null,
        [string]$Token = $null
    )

    $uri = "$base$Path"
    $headers = @{}

    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 10
        return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body $json -TimeoutSec 25
    }

    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -TimeoutSec 25
}
#pragma warning restore PSUseApprovedVerbs

$report = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param([string]$Step, [string]$Result, [string]$Detail)

    $report.Add([PSCustomObject]@{
        Step   = $Step
        Result = $Result
        Detail = $Detail
    }) | Out-Null
}

$tempTruckId = $null
$tempDriverId = $null
$tempTripId = $null
$tempExpenseId = $null
$tempFuelId = $null
$tempInvoiceId = $null
$token = $null

try {
    $tempEmail = "smoke.$now@example.com"
    $tempPassword = "SmokePass123!"

    $register = Invoke-Api -Method "POST" -Path "/auth/register" -Body @{
        email    = $tempEmail
        password = $tempPassword
        name     = "Smoke Tester $now"
        role     = "driver"
        phone    = "7$($now.Substring([Math]::Max(0, $now.Length - 9)))"
    }

    if (-not $register.success) {
        throw "Registration failed"
    }
    Add-Result -Step "Auth register" -Result "PASS" -Detail "user=$tempEmail"

    $login = Invoke-Api -Method "POST" -Path "/auth/login" -Body @{ email = $tempEmail; password = $tempPassword }
    if (-not $login.success -or -not $login.token) {
        throw "Login failed for registered user"
    }
    $token = [string]$login.token
    Add-Result -Step "Auth login" -Result "PASS" -Detail "token issued for $tempEmail"

    $truck = Invoke-Api -Method "POST" -Path "/trucks" -Body @{
        truck_number     = "TEST-$now"
        capacity         = 11
        status           = "Available"
        insurance_expiry = (Get-Date).AddDays(320).ToString("yyyy-MM-dd")
        fitness_expiry   = (Get-Date).AddDays(160).ToString("yyyy-MM-dd")
    }
    if (-not $truck.success -or -not $truck.data.truck_id) {
        throw "Truck create failed"
    }
    $tempTruckId = [int]$truck.data.truck_id
    Add-Result -Step "Create truck" -Result "PASS" -Detail "truck_id=$tempTruckId"

    $phoneTail = $now.Substring([Math]::Max(0, $now.Length - 9))
    $driver = Invoke-Api -Method "POST" -Path "/drivers" -Body @{
        name           = "Temp Driver $now"
        phone          = "9$phoneTail"
        license_number = "LIC-$now"
        license_expiry = (Get-Date).AddDays(420).ToString("yyyy-MM-dd")
        status         = "Available"
    }
    if (-not $driver.success -or -not $driver.data.driver_id) {
        throw "Driver create failed"
    }
    $tempDriverId = [int]$driver.data.driver_id
    Add-Result -Step "Create driver" -Result "PASS" -Detail "driver_id=$tempDriverId"

    $trip = Invoke-Api -Method "POST" -Path "/trips" -Body @{
        truck_id      = $tempTruckId
        driver_id     = $tempDriverId
        lr_number     = "LR-$now"
        source        = "Bangalore"
        destination   = "Mysore"
        base_freight  = 18000
        toll_amount   = 1200
        loading_cost  = 400
        unloading_cost = 450
        other_charges = 300
        gst_percentage = 5
        driver_bata    = 700
        empty_km       = 18
        loaded_km      = 132
        status         = "planned"
    }
    if (-not $trip.success -or -not $trip.data.trip_id) {
        throw "Trip create failed"
    }
    $tempTripId = [int]$trip.data.trip_id
    Add-Result -Step "Create trip" -Result "PASS" -Detail "trip_id=$tempTripId"

    $start = Invoke-Api -Method "POST" -Path "/trips/$tempTripId/start"
    if (-not $start.success) {
        throw "Trip start failed"
    }
    Add-Result -Step "Start trip" -Result "PASS" -Detail "trip_id=$tempTripId"

    $end = Invoke-Api -Method "POST" -Path "/trips/$tempTripId/end"
    if (-not $end.success) {
        throw "Trip end failed"
    }
    Add-Result -Step "End trip" -Result "PASS" -Detail "trip_id=$tempTripId"

    $expense = Invoke-Api -Method "POST" -Path "/expenses" -Body @{
        trip_id     = $tempTripId
        truck_id    = $tempTruckId
        category    = "Fuel"
        amount      = 1450
        description = "Smoke test expense"
    }
    if (-not $expense.success -or -not $expense.data.expense_id) {
        throw "Expense create failed"
    }
    $tempExpenseId = [string]$expense.data.expense_id
    Add-Result -Step "Create expense" -Result "PASS" -Detail "expense_id=$tempExpenseId"

    $expenseDelete = Invoke-Api -Method "DELETE" -Path "/expenses/$tempExpenseId"
    if (-not $expenseDelete.success) {
        throw "Expense delete failed"
    }
    Add-Result -Step "Delete expense" -Result "PASS" -Detail $tempExpenseId

    $invoice = Invoke-Api -Method "POST" -Path "/invoices" -Body @{
        trip_id  = $tempTripId
        due_date = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
    }
    if (-not $invoice.success -or -not $invoice.data.invoice_id) {
        throw "Invoice create failed"
    }
    $tempInvoiceId = [string]$invoice.data.invoice_id
    Add-Result -Step "Create invoice" -Result "PASS" -Detail "invoice_id=$tempInvoiceId"

    $payment = Invoke-Api -Method "POST" -Path "/invoices/$tempInvoiceId/payment" -Body @{ amount = 1000 }
    if (-not $payment.success) {
        throw "Invoice payment failed"
    }
    Add-Result -Step "Invoice payment" -Result "PASS" -Detail "invoice_id=$tempInvoiceId"

    $fuel = Invoke-Api -Method "POST" -Path "/fuel" -Body @{
        trip_id         = $tempTripId
        liters          = 20
        price_per_liter = 95
        total_cost      = 1900
    }
    if (-not $fuel.success -or -not $fuel.data.fuel_id) {
        throw "Fuel create failed"
    }
    $tempFuelId = [int]$fuel.data.fuel_id
    Add-Result -Step "Create fuel log" -Result "PASS" -Detail "fuel_id=$tempFuelId"

    $fuelDelete = Invoke-Api -Method "DELETE" -Path "/fuel/$tempFuelId"
    if (-not $fuelDelete.success) {
        throw "Fuel delete failed"
    }
    Add-Result -Step "Delete fuel log" -Result "PASS" -Detail "fuel_id=$tempFuelId"

    $maintenance = Invoke-Api -Method "POST" -Path "/maintenance" -Body @{
        truck_id     = $tempTruckId
        service_date = (Get-Date).ToString("yyyy-MM-dd")
        description  = "Smoke test maintenance"
        cost         = 500
    }
    if (-not $maintenance.success) {
        throw "Maintenance create failed"
    }
    Add-Result -Step "Create maintenance log" -Result "PASS" -Detail "maintenance_id=$($maintenance.data.maintenance_id)"

    $bookingPhoneTail = $now.Substring([Math]::Max(0, $now.Length - 9))
    $booking = Invoke-Api -Method "POST" -Path "/bookings" -Body @{
        customer_name     = "Smoke Test Customer"
        contact_number    = "8$bookingPhoneTail"
        pickup_location   = "Chennai"
        destination       = "Salem"
        load_type         = "General Goods"
        weight            = 8
        pickup_date       = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
        delivery_deadline = (Get-Date).AddDays(4).ToString("yyyy-MM-dd")
        offered_price     = 12000
    }
    if (-not $booking.success -or -not $booking.data.id) {
        throw "Booking create failed"
    }
    Add-Result -Step "Create booking request" -Result "PASS" -Detail "booking_id=$($booking.data.id)"

    $summary = Invoke-Api -Method "GET" -Path "/trips/analytics/summary"
    if (-not $summary.success) {
        throw "Trip analytics summary failed"
    }
    Add-Result -Step "Trip analytics summary" -Result "PASS" -Detail "loaded"

    $intelBookings = Invoke-Api -Method "GET" -Path "/intelligence/bookings?status=pending"
    if (-not $intelBookings.success) {
        throw "Intelligence bookings failed"
    }
    Add-Result -Step "Intelligence bookings" -Result "PASS" -Detail "count=$($intelBookings.count)"

    $intelFuel = Invoke-Api -Method "GET" -Path "/intelligence/fuel/anomalies"
    if (-not $intelFuel.success) {
        throw "Intelligence fuel anomalies failed"
    }
    Add-Result -Step "Intelligence fuel anomalies" -Result "PASS" -Detail "count=$($intelFuel.count)"

    $intelBackhaul = Invoke-Api -Method "GET" -Path "/intelligence/backhaul/suggestions"
    if (-not $intelBackhaul.success) {
        throw "Intelligence backhaul failed"
    }
    Add-Result -Step "Intelligence backhaul" -Result "PASS" -Detail "count=$($intelBackhaul.count)"

    $intelAlerts = Invoke-Api -Method "GET" -Path "/intelligence/alerts?limit=5"
    if (-not $intelAlerts.success) {
        throw "Intelligence alerts failed"
    }
    Add-Result -Step "Intelligence alerts" -Result "PASS" -Detail "count=$($intelAlerts.count)"

    $notifications = Invoke-Api -Method "GET" -Path "/notifications" -Token $token
    if (-not $notifications.success) {
        throw "Get notifications failed"
    }
    Add-Result -Step "Get notifications" -Result "PASS" -Detail "count=$($notifications.count)"

    $readAll = Invoke-Api -Method "PUT" -Path "/notifications/read-all" -Token $token
    if (-not $readAll.success) {
        throw "Mark notifications read failed"
    }
    Add-Result -Step "Mark notifications read" -Result "PASS" -Detail "ok"
}
catch {
    Add-Result -Step "Smoke suite error" -Result "FAIL" -Detail $_.Exception.Message
}
finally {
    if ($tempDriverId) {
        try {
            $driverDelete = Invoke-Api -Method "DELETE" -Path "/drivers/$tempDriverId"
            if ($driverDelete.success) {
                Add-Result -Step "Cleanup driver" -Result "PASS" -Detail "driver_id=$tempDriverId"
            }
        }
        catch {
            Add-Result -Step "Cleanup driver" -Result "FAIL" -Detail $_.Exception.Message
        }
    }

    if ($tempTruckId) {
        try {
            $truckDelete = Invoke-Api -Method "DELETE" -Path "/trucks/$tempTruckId"
            if ($truckDelete.success) {
                Add-Result -Step "Cleanup truck" -Result "PASS" -Detail "truck_id=$tempTruckId"
            }
        }
        catch {
            Add-Result -Step "Cleanup truck" -Result "FAIL" -Detail $_.Exception.Message
        }
    }

    $report | Format-Table -Wrap -AutoSize
}
