# Adds the app's own files to Capacitor's generated ios/App/App.xcodeproj and sets build settings.
#   ruby tools/ipa/patch-project.rb <App.xcodeproj> <plan.json>
# plan.json (written by tools/ipa.mjs):
#   { "sources": ["OyunViewController.swift", ...],   # files already copied into ios/App/App/
#     "resources": ["PrivacyInfo.xcprivacy", ...],
#     "settings": { "TARGETED_DEVICE_FAMILY": "1", ... } }
# Uses the xcodeproj gem (it ships with CocoaPods on GitHub's macOS runners).
require 'json'
require 'xcodeproj'

proj_path, plan_path = ARGV
abort('usage: patch-project.rb <App.xcodeproj> <plan.json>') unless proj_path && plan_path
plan = JSON.parse(File.read(plan_path))
project = Xcodeproj::Project.open(proj_path)
target = project.targets.find { |t| t.name == 'App' } or abort('no App target')
group = project.main_group.children.find { |g| g.respond_to?(:path) && (g.path == 'App' || g.display_name == 'App') } or abort('no App group')

synced = group.class.name.include?('Synchronized')
add = lambda do |name, phase|
  next if synced # Xcode 16 folder groups pick up every file in the folder by themselves
  ref = group.files.find { |f| f.path == name } || group.new_reference(name)
  phase.add_file_reference(ref, true) unless phase.files_references.include?(ref)
end
(plan['sources'] || []).each { |f| add.call(f, target.source_build_phase) }
(plan['resources'] || []).each { |f| add.call(f, target.resources_build_phase) }
# entitlements are referenced from build settings, not compiled: a plain file reference
(plan['plain'] || []).each { |f| group.files.find { |x| x.path == f } || group.new_reference(f) unless synced }

target.build_configurations.each do |c|
  (plan['settings'] || {}).each { |k, v| c.build_settings[k] = v }
end
project.save
puts "patched #{File.basename(proj_path)}: #{(plan['sources'] || []).size} sources, #{(plan['resources'] || []).size} resources, #{(plan['settings'] || {}).size} settings#{synced ? ' (folder-synced group)' : ''}"
