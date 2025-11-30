use csv::{Reader, Writer};
use serde_json::{Value, Map};
use std::fs::File;

#[tauri::command]
pub fn generate_csv(json_data: Vec<Value>, file_path: String) -> Result<String, String> {
    // Create or open the CSV file
    let file = File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;
    
    let mut writer = Writer::from_writer(file);
    
    // Check if the JSON array is empty
    if json_data.is_empty() {
        return Err("JSON array is empty".to_string());
    }
    
    // Extract headers from the first object
    let headers: Vec<String> = if let Some(first_obj) = json_data.first() {
        if let Value::Object(map) = first_obj {
            map.keys().map(|k| k.to_string()).collect()
        } else {
            return Err("JSON array must contain objects".to_string());
        }
    } else {
        return Err("JSON array is empty".to_string());
    };
    
    // Write headers
    writer
        .write_record(&headers)
        .map_err(|e| format!("Failed to write headers: {}", e))?;
    
    // Write data rows
    for item in json_data.iter() {
        if let Value::Object(map) = item {
            let row: Vec<String> = headers
                .iter()
                .map(|header| {
                    map.get(header)
                        .map(|v| match v {
                            Value::String(s) => s.clone(),
                            Value::Number(n) => n.to_string(),
                            Value::Bool(b) => b.to_string(),
                            Value::Null => String::new(),
                            _ => v.to_string(),
                        })
                        .unwrap_or_default()
                })
                .collect();
            
            writer
                .write_record(&row)
                .map_err(|e| format!("Failed to write row: {}", e))?;
        } else {
            return Err("All items in JSON array must be objects".to_string());
        }
    }
    
    // Flush the writer to ensure all data is written
    writer
        .flush()
        .map_err(|e| format!("Failed to flush writer: {}", e))?;
    
    Ok(format!("CSV file created successfully at: {}", file_path))
}

#[tauri::command]
pub fn read_csv(file_path: String) -> Result<Vec<Value>, String> {
    // Open the CSV file
    let file = File::open(&file_path).map_err(|e| format!("Failed to open file: {}", e))?;
    
    let mut reader = Reader::from_reader(file);
    
    // Get headers from the CSV file
    let headers = reader
        .headers()
        .map_err(|e| format!("Failed to read headers: {}", e))?;
    
    let headers: Vec<String> = headers.iter().map(|h| h.to_string()).collect();
    
    // Read all records
    let mut records = Vec::new();
    
    for result in reader.records() {
        let record = result.map_err(|e| format!("Failed to read record: {}", e))?;
        
        // Create a JSON object for this record
        let mut json_obj = Map::new();
        
        // Map each field to the corresponding header
        for (header, field) in headers.iter().zip(record.iter()) {
            json_obj.insert(header.clone(), Value::String(field.to_string()));
        }
        
        records.push(Value::Object(json_obj));
    }
    
    Ok(records)
}


