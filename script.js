// 全域變數
let stockData = null;
let companiesData = {};
let performanceChart = null;
let selectedStock = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadCompaniesData();
    initializeStockCards();
    initializeDateRange();
    setupSearchFilter();
    addSmoothScroll();
});

// 載入公司數據
async function loadCompaniesData() {
    try {
        const response = await fetch('companies.json');
        companiesData = await response.json();
    } catch (error) {
        console.error('載入公司數據時發生錯誤:', error);
    }
}

// 載入特定股票的數據
async function loadStockData(symbol) {
    try {
        const response = await fetch(`stock_data/${symbol}.json`);
        const data = await response.json();
        return data.prices;
    } catch (error) {
        console.error(`載入 ${symbol} 數據時發生錯誤:`, error);
        alert(`載入 ${symbol} 數據時發生錯誤，請稍後再試`);
        return null;
    }
}

// 初始化股票卡片
function initializeStockCards() {
    const stockGrid = document.getElementById('stockGrid');
    stockGrid.innerHTML = '';

    // 先渲染所有卡片（佔位符），然後非同步批次更新漲跌幅
    const entries = Object.entries(companiesData);
    entries.forEach(([symbol, company]) => {
        const card = document.createElement('div');
        card.className = 'stock-card';
        card.style.cursor = 'pointer';
        card.id = `card-${symbol}`;
        card.addEventListener('click', () => selectStock(symbol));

        card.innerHTML = `
            <img src="${company.icon}" alt="${company.name}" onerror="this.src='icons/default.png'">
            <h3>${company.chinese_name}</h3>
            <p class="stock-symbol">${symbol}</p>
            <p class="stock-sector">${company.sector} | ${company.industry}</p>
            <span class="price-change" id="pc-${symbol}">—</span>
        `;
        stockGrid.appendChild(card);
    });

    // 批次讀取 JSON，每批 5 支避免同時發太多 request
    const BATCH = 5;
    async function processBatch(batch) {
        await Promise.all(batch.map(async ([symbol]) => {
            try {
                const res = await fetch(`stock_data/${symbol}.json`);
                if (!res.ok) return;
                const data = await res.json();
                const prices = data.prices;
                const dates = Object.keys(prices).sort();
                if (dates.length < 2) return;

                const latestPrice = prices[dates[dates.length - 1]];
                const prevPrice = prices[dates[dates.length - 2]];
                const change = ((latestPrice - prevPrice) / prevPrice) * 100;
                const cls = change >= 0 ? 'positive' : 'negative';
                const text = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

                const el = document.getElementById(`pc-${symbol}`);
                if (el) {
                    el.className = `price-change ${cls}`;
                    el.textContent = text;
                }
            } catch (_) { /* 載入失敗時保持 — 佔位 */ }
        }));
    }

    (async () => {
        for (let i = 0; i < entries.length; i += BATCH) {
            await processBatch(entries.slice(i, i + BATCH));
        }
    })();
}

// 設置搜索過濾功能
function setupSearchFilter() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.stock-card');

        cards.forEach(card => {
            const symbol = card.querySelector('.stock-symbol').textContent.toLowerCase();
            const name = card.querySelector('h3').textContent.toLowerCase();
            const sector = card.querySelector('.stock-sector').textContent.toLowerCase();

            if (symbol.includes(searchTerm) ||
                name.includes(searchTerm) ||
                sector.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// 初始化日期範圍
function initializeDateRange() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 5);

    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    // 設置最大日期為今天
    const today = new Date().toISOString().split('T')[0];
    endDateInput.max = today;

    // 設置預設值
    startDateInput.value = startDate.toISOString().split('T')[0];
    endDateInput.value = today;

    // 添加日期變更事件監聽器
    startDateInput.addEventListener('change', function () {
        // 確保結束日期不早於開始日期
        if (endDateInput.value < this.value) {
            endDateInput.value = this.value;
        }
    });

    endDateInput.addEventListener('change', function () {
        // 確保開始日期不晚於結束日期
        if (startDateInput.value > this.value) {
            startDateInput.value = this.value;
        }
    });
}

// 返回主頁面
function showMainPage() {
    // 強制重新整理並回到最外層 (或是清掉 query string 及 hash)，這樣最不會有殘留
    window.location.href = window.location.pathname;
}

// 監聽上一頁 (不論哪種狀態變化)
window.addEventListener('popstate', function () {
    window.location.reload();
});

// 重置績效指標
function resetResults() {
    // 重置數值顯示
    document.getElementById('totalInvestment').textContent = '$0';
    document.getElementById('currentValue').textContent = '$0';
    document.getElementById('totalProfitLoss').textContent = '$0';
    document.getElementById('totalReturn').textContent = '0%';
    document.getElementById('annualReturn').textContent = '0%';
    document.getElementById('totalFees').textContent = '$0';

    // 移除所有正負值的類別
    const elements = ['totalProfitLoss', 'totalReturn', 'annualReturn'];
    elements.forEach(id => {
        const element = document.getElementById(id);
        element.classList.remove('positive', 'negative');
    });

    // 清除圖表
    if (window.myChart) {
        window.myChart.destroy();
        window.myChart = null;
    }

    // 隱藏結果區域
    document.getElementById('resultsSection').style.display = 'none';

    // 重置投資日期選擇
    document.querySelectorAll('input[name="investmentDay"]').forEach(checkbox => {
        checkbox.checked = false;
    });

    // 重置其他輸入欄位
    document.getElementById('monthlyInvestment').value = '1000';
    document.getElementById('feeRate').value = '0.1';
    document.getElementById('holidayHandling').value = 'next';
}

// 選擇股票
async function selectStock(symbol) {
    try {
        selectedStock = symbol;
        const company = companiesData[symbol];

        if (!company) {
            console.error('找不到公司資料:', symbol);
            alert('找不到公司資料，請重新整理頁面後再試');
            return;
        }

        if (!company.ipo_date) {
            console.error('公司缺少上市日期:', symbol);
            alert('公司資料不完整，請聯繫管理員');
            return;
        }

        // 檢查是否有必要的資料欄位
        const requiredFields = ['chinese_name', 'description', 'headquarters', 'ceo', 'employees', 'key_products', 'key_services'];
        const missingFields = requiredFields.filter(field => !company[field]);
        if (missingFields.length > 0) {
            console.error('公司資料缺少必要欄位:', symbol, missingFields);
            alert('公司資料不完整，請聯繫管理員');
            return;
        }

        // 設置日期限制
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');

        if (!startDateInput || !endDateInput) {
            console.error('找不到日期輸入欄位');
            alert('頁面元素缺失，請重新整理後再試');
            return;
        }

        // 設置最小日期為公司上市日期
        startDateInput.min = company.ipo_date;
        const currentStartDate = new Date(startDateInput.value);
        const ipoDate = new Date(company.ipo_date);

        // 如果目前選擇的日期早於上市日期，則設為上市日期
        if (currentStartDate < ipoDate) {
            startDateInput.value = company.ipo_date;
        }

        // 設置最大日期為今天
        const today = new Date().toISOString().split('T')[0];
        endDateInput.max = today;
        const currentEndDate = new Date(endDateInput.value);

        // 如果結束日期晚於今天，則設為今天
        if (currentEndDate > new Date(today)) {
            endDateInput.value = today;
        }

        // 更新回測頁面的公司信息
        const stockIcon = document.getElementById('selectedStockIcon');
        const stockName = document.getElementById('selectedStockName');
        const stockDesc = document.getElementById('selectedStockDescription');

        if (!stockIcon || !stockName || !stockDesc) {
            console.error('找不到公司資訊顯示元素');
            alert('頁面元素缺失，請重新整理後再試');
            return;
        }

        stockIcon.src = company.icon || 'icons/default.png';
        stockIcon.onerror = () => stockIcon.src = 'icons/default.png';
        stockName.textContent = `${company.chinese_name} (${symbol})`;
        stockDesc.innerHTML = `
            <p>${company.description}</p>
            <div class="company-details">
                <div class="detail-item">
                    <span class="label">上市時間</span>
                    <span class="value">${company.ipo_date}</span>
                </div>
                <div class="detail-item">
                    <span class="label">總部</span>
                    <span class="value">${company.headquarters}</span>
                </div>
                <div class="detail-item">
                    <span class="label">CEO</span>
                    <span class="value">${company.ceo}</span>
                </div>
                <div class="detail-item">
                    <span class="label">員工數</span>
                    <span class="value">${company.employees}</span>
                </div>
            </div>
            <div class="company-products">
                <h4>主要產品</h4>
                <p>${company.key_products.join('、')}</p>
                <h4>主要服務</h4>
                <p>${company.key_services.join('、')}</p>
            </div>
        `;

        // 重置結果區域
        resetResults();

        // 切換頁面顯示
        const mainPage = document.getElementById('mainPage');
        const backtestPage = document.getElementById('backtestPage');

        if (!mainPage || !backtestPage) {
            console.error('找不到頁面切換元素');
            alert('頁面元素缺失，請重新整理後再試');
            return;
        }

        mainPage.style.display = 'none';
        backtestPage.style.display = 'block';


        if (arguments.length < 2 || !arguments[1]) {
            history.pushState({ page: 'backtest' }, '', '');
        }

    } catch (error) {
        console.error('選擇股票時發生錯誤:', error);
        alert('發生未預期的錯誤，請重新整理頁面後再試');
    }
}

// 計算投資組合表現
async function calculatePortfolioPerformance() {
    if (!selectedStock) {
        alert('請先選擇一支股票');
        return;
    }

    // 在手機版上，滾動到結果區域
    if (window.innerWidth <= 768) {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) {
            setTimeout(() => {
                resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 500); // 等待結果顯示後再滾動
        }
    }

    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const monthlyInvestment = parseFloat(document.getElementById('monthlyInvestment').value);
    const feeRate = parseFloat(document.getElementById('feeRate').value) / 100;
    const company = companiesData[selectedStock];

    // 檢查開始日期是否早於上市日期
    if (new Date(startDate) < new Date(company.ipo_date)) {
        alert(`此公司上市時間：${company.ipo_date}`);
        document.getElementById('startDate').value = company.ipo_date;
        return;
    }

    // 獲取選擇的投資日期
    const selectedDays = Array.from(document.querySelectorAll('input[name="investmentDay"]:checked'))
        .map(checkbox => parseInt(checkbox.value));

    if (selectedDays.length === 0) {
        alert('請至少選擇一個投資日期');
        return;
    }

    // 載入股票數據
    const priceData = await loadStockData(selectedStock);
    if (!priceData) return;

    // 過濾日期範圍內的數據並排序
    const tradingDays = Object.entries(priceData)
        .filter(([date]) => date >= startDate && date <= endDate)
        .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));

    // 計算每月投資結果
    let totalInvestment = 0;
    let totalShares = 0;
    let totalFees = 0;
    let monthlyResults = [];
    let currentMonth = '';
    let pendingDays = [];

    // 對每個交易日進行處理
    tradingDays.forEach(([date, price]) => {
        const currentDate = new Date(date);
        const dayOfMonth = currentDate.getDate();
        const month = date.substring(0, 7); // YYYY-MM

        // 檢查是否進入新月份
        if (month !== currentMonth) {
            currentMonth = month;
            pendingDays = [...selectedDays]; // 重置待處理投資日期
        }

        // 找出當天需要投資的日期（即選定日期在或早於當天且尚未投資）
        const investDays = pendingDays.filter(day => day <= dayOfMonth);

        if (investDays.length > 0) {
            let dailyInvestment = 0;
            let dailyShares = 0;
            let dailyFees = 0;

            // 為每個應投資的日期計算投資金額
            investDays.forEach(day => {
                const investment = monthlyInvestment / selectedDays.length;
                const fee = investment * feeRate;
                const actualInvestment = investment - fee;
                const shares = actualInvestment / price;

                dailyInvestment += investment;
                dailyFees += fee;
                dailyShares += shares;
            });

            // 更新總計
            totalInvestment += dailyInvestment;
            totalFees += dailyFees;
            totalShares += dailyShares;

            // 記錄當天結果
            monthlyResults.push({
                date,
                price,
                dailyInvestment,
                dailyShares,
                dailyFees,
                totalInvestment,
                totalFees,
                totalShares,
                currentValue: totalShares * price
            });

            // 從待處理清單中移除已投資的日期
            pendingDays = pendingDays.filter(day => !investDays.includes(day));
        }
    });

    // 計算報酬率和其他指標
    const lastResult = monthlyResults[monthlyResults.length - 1];
    const totalProfitLoss = lastResult.currentValue - lastResult.totalInvestment;
    const totalReturn = totalProfitLoss / lastResult.totalInvestment;
    const years = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24 * 365);
    const annualReturn = Math.pow(1 + totalReturn, 1 / years) - 1;

    // 更新績效指標
    document.getElementById('totalInvestment').textContent = formatCurrency(lastResult.totalInvestment);
    document.getElementById('currentValue').textContent = formatCurrency(lastResult.currentValue);
    document.getElementById('totalProfitLoss').textContent = formatCurrency(totalProfitLoss);
    document.getElementById('totalProfitLoss').className = totalProfitLoss >= 0 ? 'positive' : 'negative';
    document.getElementById('totalReturn').textContent = formatPercentage(totalReturn);
    document.getElementById('totalReturn').className = totalReturn >= 0 ? 'positive' : 'negative';
    document.getElementById('annualReturn').textContent = formatPercentage(annualReturn);
    document.getElementById('annualReturn').className = annualReturn >= 0 ? 'positive' : 'negative';
    document.getElementById('totalFees').textContent = formatCurrency(lastResult.totalFees);

    // 更新圖表
    updatePerformanceChart(monthlyResults);
}

// 更新績效圖表
function updatePerformanceChart(results) {
    const ctx = document.getElementById('performanceChart').getContext('2d');

    if (window.myChart) {
        window.myChart.destroy();
    }

    const dates = results.map(r => r.date);
    const investments = results.map(r => r.totalInvestment);
    const values = results.map(r => r.currentValue);
    const fees = results.map(r => r.totalFees);

    window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: '總投資金額',
                    data: investments,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                },
                {
                    label: '投資組合價值',
                    data: values,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                },
                {
                    label: '累計手續費',
                    data: fees,
                    borderColor: 'rgb(255, 159, 64)',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    ticks: {
                        color: '#ffffff' // X 軸標籤變白色
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#ffffff', // Y 軸標籤變白色
                        callback: value => formatCurrency(value)
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff' // 圖例文字變白色
                    }
                },
                tooltip: {
                    callbacks: {
                        label: context => formatCurrency(context.raw)
                    }
                }
            }
        }
    });

    // 顯示結果區域
    document.getElementById('resultsSection').style.display = 'block';
}


// 格式化貨幣
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(value);
}

// 格式化百分比
function formatPercentage(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

// 為計算按鈕添加點擊效果
document.getElementById('calculateBtn').addEventListener('click', function (e) {
    const btn = e.currentTarget;

    // 創建漣漪效果
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');
    btn.appendChild(ripple);

    // 設置漣漪位置
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = e.clientX - rect.left - size / 2 + 'px';
    ripple.style.top = e.clientY - rect.top - size / 2 + 'px';

    // 移除漣漪元素
    ripple.addEventListener('animationend', () => {
        ripple.remove();
    });

    // 執行計算
    calculatePortfolioPerformance();
});

// 添加平滑滾動功能
document.addEventListener('DOMContentLoaded', function () {
    // 監聽所有按鈕點擊
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', function (e) {
            // 添加漣漪效果
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            this.appendChild(ripple);

            // 設置漣漪位置
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = e.clientX - rect.left - size / 2 + 'px';
            ripple.style.top = e.clientY - rect.top - size / 2 + 'px';

            // 移除漣漪元素
            ripple.addEventListener('animationend', () => {
                ripple.remove();
            });
        });
    });

    // 監聽股票卡片懸停
    document.querySelectorAll('.stock-card').forEach(card => {
        card.addEventListener('mouseenter', function () {
            this.style.transform = 'translateY(-5px) scale(1.02)';
        });

        card.addEventListener('mouseleave', function () {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
}); 
