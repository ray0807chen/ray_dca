import yfinance as yf
import pandas as pd
import json
from datetime import datetime, timedelta
import time
import os


def ensure_data_directory():
    """確保數據目錄存在"""
    if not os.path.exists('stock_data'):
        os.makedirs('stock_data')


def load_companies():
    """載入公司列表"""
    with open('companies.json', 'r', encoding='utf-8') as f:
        companies = json.load(f)
    return companies


def load_existing_data(symbol):
    """
    讀取已存在的 JSON 資料。
    回傳 (stock_data dict, last_date str 或 None)
    """
    file_path = f'stock_data/{symbol}.json'
    if not os.path.exists(file_path):
        return None, None
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        prices = data.get('prices', {})
        last_date = max(prices.keys()) if prices else None
        return data, last_date
    except Exception:
        return None, None


def get_full_history_data(symbol, ipo_date):
    """獲取股票的完整歷史數據（首次初始化用）"""
    try:
        stock = yf.Ticker(symbol)
        df = stock.history(period="max")
        if df.empty:
            return {}
        prices = {}
        for date, row in df.iterrows():
            if pd.notna(row['Close']):
                date_str = date.strftime('%Y-%m-%d')
                prices[date_str] = round(float(row['Close']), 2)
        return prices
    except Exception as e:
        print(f"  [錯誤] 獲取歷史數據失敗: {e}")
        return {}


def get_incremental_data(symbol, last_date_str):
    """
    只抓 last_date 之後（不含當天）到今天的新資料。
    若沒有新資料回傳空 dict。
    """
    try:
        start = (datetime.strptime(last_date_str, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        today = datetime.now().strftime('%Y-%m-%d')

        if start > today:
            return {}  # 已是最新，不需更新

        stock = yf.Ticker(symbol)
        df = stock.history(start=start, end=today)

        if df.empty:
            return {}

        new_prices = {}
        for date, row in df.iterrows():
            if pd.notna(row['Close']):
                date_str = date.strftime('%Y-%m-%d')
                new_prices[date_str] = round(float(row['Close']), 2)

        return new_prices
    except Exception as e:
        print(f"  [錯誤] 獲取增量數據失敗: {e}")
        return {}


def save_stock_data(symbol, company, prices):
    """將 prices dict 儲存（或更新）成 JSON 檔案"""
    if not prices:
        return False

    sorted_prices = dict(sorted(prices.items()))

    stock_data = {
        'symbol': symbol,
        'name': company.get('name', ''),
        'chinese_name': company.get('chinese_name', ''),
        'sector': company.get('sector', ''),
        'industry': company.get('industry', ''),
        'ipo_date': company.get('ipo_date', ''),
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'total_records': len(sorted_prices),
        'date_range': {
            'start': min(sorted_prices.keys()),
            'end': max(sorted_prices.keys())
        },
        'prices': sorted_prices
    }

    file_path = f'stock_data/{symbol}.json'
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(stock_data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"  [錯誤] 儲存失敗: {e}")
        return False


def update_all_stocks():
    """
    主更新邏輯：
    - 若 JSON 已存在 → 只抓新增天數 append 進去（增量更新）
    - 若 JSON 不存在 → 下載完整歷史（首次初始化）
    """
    ensure_data_directory()
    companies = load_companies()

    total = len(companies)
    updated = 0
    skipped = 0
    failed = 0

    print(f"=== 股票數據更新開始 ({datetime.now().strftime('%Y-%m-%d %H:%M')}) ===")
    print(f"股票數量: {total}")
    print()

    for i, (symbol, company) in enumerate(companies.items(), 1):
        chinese = company.get('chinese_name', '')
        existing_data, last_date = load_existing_data(symbol)

        if existing_data and last_date:
            # ── 增量更新 ──
            new_prices = get_incremental_data(symbol, last_date)

            if not new_prices:
                print(f"[{i}/{total}] {symbol} 已是最新（末日期 {last_date}），略過")
                skipped += 1
            else:
                # 把新資料 merge 進原本的 prices
                merged = {**existing_data['prices'], **new_prices}
                if save_stock_data(symbol, company, merged):
                    print(f"[{i}/{total}] {symbol} +{len(new_prices)} 筆（{last_date} → {max(new_prices.keys())}）")
                    updated += 1
                else:
                    print(f"[{i}/{total}] {symbol} [儲存失敗]")
                    failed += 1
        else:
            # ── 首次初始化 ──
            ipo_date = company.get('ipo_date')
            if not ipo_date:
                print(f"[{i}/{total}] {symbol} 缺少上市日期，略過")
                skipped += 1
                continue

            print(f"[{i}/{total}] {symbol} ({chinese}) 首次初始化...")
            prices = get_full_history_data(symbol, ipo_date)

            if not prices:
                print(f"  [失敗] 無法取得數據")
                failed += 1
            elif save_stock_data(symbol, company, prices):
                print(f"  [完成] 寫入 {len(prices)} 筆歷史數據")
                updated += 1
            else:
                failed += 1

        time.sleep(1)  # 每次請求間隔 1 秒，避免被限流

    print()
    print(f"=== 更新完成 ===")
    print(f"更新: {updated}  略過: {skipped}  失敗: {failed}")


if __name__ == "__main__":
    update_all_stocks()
