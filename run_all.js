#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('ТЕСТОВОЕ ЗАДАНИЕ: ПАРСЕР VPROK.RU');
console.log('='.repeat(70));
console.log('Выполняет обе части задания:\n');
console.log('1. 📸 Парсинг отдельного товара (со скриншотом)');
console.log('2. 🔄 Парсинг категории через Puppeteer');
console.log('='.repeat(70));

async function runPart1() {
    console.log('\n🚀 ЗАПУСК ЧАСТИ №1: Парсинг товара\n');
    
    const productUrl = 'https://www.vprok.ru/product/domik-v-derevne-dom-v-der-moloko-ster-3-2-950g--309202';
    const region = 'Санкт-Петербург и область';
    
    console.log(`Товар: ${productUrl}`);
    console.log(`Регион: ${region}`);
    console.log('-'.repeat(50));
    
    try {
        // Используем базовый парсер
        execSync(`node puppeteer.js "${productUrl}" "${region}"`, { 
            stdio: 'inherit',
            timeout: 120000
        });
        
        // Проверяем созданные файлы
        const filesCreated = fs.existsSync('screenshot.jpg') && fs.existsSync('product.txt');
        
        if (filesCreated) {
            console.log('\n✅ Часть №1 выполнена успешно!');
            console.log('📁 Созданные файлы:');
            console.log('  - screenshot.jpg');
            console.log('  - product.txt');
            
            // Показываем содержимое product.txt
            try {
                const productData = fs.readFileSync('product.txt', 'utf8');
                console.log('\n📄 СОДЕРЖИМОЕ product.txt:');
                console.log('-'.repeat(40));
                console.log(productData);
                console.log('-'.repeat(40));
            } catch (e) {
                // Пропускаем ошибки
            }
            
            return true;
        } else {
            console.log('\n⚠️ Файлы не созданы!');
            return false;
        }
        
    } catch (error) {
        console.error('\n❌ Ошибка при выполнении части №1:', error.message);
        return false;
    }
}

async function runPart2() {
    console.log('\n🚀 ЗАПУСК ЧАСТИ №2: Парсинг категории\n');
    
    const categoryUrl = 'https://www.vprok.ru/catalog/7382/pomidory-i-ovoschnye-nabory';
    
    console.log(`Категория: ${categoryUrl}`);
    console.log('-'.repeat(50));
    
    try {
        // Проверяем наличие файла парсера категорий
        if (!fs.existsSync('category_parser.js')) {
            console.log('❌ Файл category_parser.js не найден!');
            console.log('Создайте файл category_parser.js');
            return false;
        }
        
        execSync(`node category_parser.js "${categoryUrl}"`, { 
            stdio: 'inherit',
            timeout: 90000 // 1.5 минуты
        });
        
        // Ищем созданные файлы
        const jsonFiles = fs.readdirSync('.').filter(file => 
            file.startsWith('category_') && file.endsWith('.json')
        );
        
        if (jsonFiles.length > 0) {
            console.log('\n✅ Часть №2 выполнена успешно!');
            
            // Читаем последний созданный файл
            const latestFile = jsonFiles.sort().reverse()[0];
            const data = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
            
            console.log('📁 Созданные файлы:');
            jsonFiles.forEach(file => console.log(`  - ${file}`));
            
            // Также ищем текстовые отчеты
            const txtFiles = fs.readdirSync('.').filter(file => 
                file.includes('category_') && file.endsWith('_report.txt')
            );
            txtFiles.forEach(file => console.log(`  - ${file}`));
            
            console.log('\n📊 РЕЗУЛЬТАТЫ:');
            console.log(`Категория: ${data.category.name}`);
            console.log(`Товаров собрано: ${data.products.length}`);
            
            // Показываем первые 5 товаров
            console.log('\n🏪 ПЕРВЫЕ 5 ТОВАРОВ:');
            data.products.slice(0, 5).forEach((product, i) => {
                console.log(`${i + 1}. ${product.name.substring(0, 50)}${product.name.length > 50 ? '...' : ''}`);
                console.log(`   💰 Цена: ${product.price || '?'} ₽${product.oldPrice ? ` (было: ${product.oldPrice} ₽)` : ''}`);
                if (product.rating) {
                    console.log(`   ⭐ Рейтинг: ${product.rating}/5${product.reviews ? ` (${product.reviews} отзывов)` : ''}`);
                }
                console.log('');
            });
            
            return true;
        } else {
            console.log('\n⚠️ Файлы не созданы!');
            return false;
        }
        
    } catch (error) {
        console.error('\n❌ Ошибка при выполнении части №2:', error.message);
        return false;
    }
}

async function main() {
    console.log('\n▶️  Автоматически выполняем обе части задания...\n');
    
    const part1Success = await runPart1();
    const part2Success = await runPart2();
    
    console.log('\n' + '='.repeat(70));
    console.log('ИТОГИ ВЫПОЛНЕНИЯ:');
    console.log('='.repeat(70));
    
    if (part1Success) {
        console.log('✅ Часть №1: ПАРСИНГ ТОВАРА - ВЫПОЛНЕНО');
    } else {
        console.log('❌ Часть №1: ПАРСИНГ ТОВАРА - НЕ ВЫПОЛНЕНО');
    }
    
    if (part2Success) {
        console.log('✅ Часть №2: ПАРСИНГ КАТЕГОРИИ - ВЫПОЛНЕНО');
    } else {
        console.log('❌ Часть №2: ПАРСИНГ КАТЕГОРИИ - НЕ ВЫПОЛНЕНО');
    }
    
    if (part1Success && part2Success) {
        console.log('\n🎉 ВСЕ ЧАСТИ ЗАДАНИЯ ВЫПОЛНЕНЫ УСПЕШНО!');
        console.log('\n📤 ЧТО ДАЛЬШЕ:');
        console.log('1. Создайте публичный репозиторий на GitHub');
        console.log('2. Загрузите все файлы проекта');
        console.log('3. Отправьте ссылку Антону Гоглеву в чате hh.ru');
        console.log('\n📁 СОЗДАННЫЕ ФАЙЛЫ:');
        
        const files = fs.readdirSync('.').filter(file => 
            file.endsWith('.jpg') || 
            file.endsWith('.txt') || 
            file.endsWith('.json') ||
            file === 'puppeteer.js' ||
            file === 'category_parser.js'
        );
        
        files.forEach(file => {
            const stats = fs.statSync(file);
            console.log(`  - ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
        });
    } else {
        console.log('\n⚠️ Есть невыполненные части задания!');
        console.log('Проверьте настройки и попробуйте снова.');
    }
    
    console.log('='.repeat(70));
}

// Запускаем
main().catch(console.error);