--        My master awaits...        --




--      We should join forces.       --

--      @Ottomated_ on twitter.      --


-- I stole this from you :)
function getItemIndex(itemName)
	for slot = 1, 16, 1 do
		local item = turtle.getItemDetail(slot)
		if(item ~= nil) then
			if(item["name"] == itemName) then
				return slot
			end
		end
	end
end

-- BEGIN MAIN CODE --

local function getNilTable(amount)
	local t = {}
	for i = 1, amount, 1 do
		table.insert(t,i,{})
	end
	return t
end

local function fillTable(t)
	for i = t.lenght + 1, 16 - t.lenght, 1 do
		table.insert(t,i,{})
	end
	return t
end


function undergoMitosis()
	turtle.select(getItemIndex("computercraft:peripheral"))
	if not turtle.place() then
		return nil
	end
	turtle.select(getItemIndex("computercraft:disk_expanded"))
	turtle.drop()	
	if not turtle.up() then
		return nil
	end
	turtle.select(getItemIndex("computercraft:turtle_expanded"))
	if not turtle.place() then
		return nil
	end
	peripheral.call("front", "turnOn")
	turtle.select(1)
	turtle.drop(math.floor(turtle.getItemCount() / 2))
	os.sleep(1)
	peripheral.call("front", "reboot")
	local cloneId = peripheral.call("front", "getID")
	if not turtle.down() then
		return nil
	end
	if not turtle.suck() then
		return nil
	end
	if not turtle.dig() then
		return nil
	end
	return cloneId
end



function mineTunnel(obj, ws)
	local file
	local blocks = {}
	for i=1,obj.length,1 do
		if obj.direction == 'forward' then
			turtle.dig()
			local success = turtle.forward()
			if not success then
				return res
			end
			ws.send(textutils.serializeJSON({move="f", nonce=obj.nonce}))
			blocks[i] = {}
			blocks[i][1] = select(2,turtle.inspectDown())
			blocks[i][2] = select(2,turtle.inspectUp())
			turtle.turnLeft()
			ws.send(textutils.serializeJSON({move="l", nonce=obj.nonce}))
			blocks[i][3] = select(2,turtle.inspect())
			turtle.turnRight()
			ws.send(textutils.serializeJSON({move="r", nonce=obj.nonce}))
			turtle.turnRight()
			ws.send(textutils.serializeJSON({move="r", nonce=obj.nonce}))
			blocks[i][4] = select(2,turtle.inspect())
			turtle.turnLeft()
			ws.send(textutils.serializeJSON({move="l", blocks=blocks[i], nonce=obj.nonce}))
		else
			if obj.direction == 'up' then 
				turtle.digUp()
				local success = turtle.up()
				if not success then
					return res
				end
				ws.send(textutils.serializeJSON({move="u", nonce=obj.nonce}))
			else
				turtle.digDown()
				local success = turtle.down()
				if not success then
					return res
				end
				ws.send(textutils.serializeJSON({move="d", nonce=obj.nonce}))
			end

			blocks[i] = {}
			blocks[i][1] = select(2,turtle.inspect())
			turtle.turnLeft()
			ws.send(textutils.serializeJSON({move="l", nonce=obj.nonce}))

			blocks[i][2] = select(2,turtle.inspect())
			turtle.turnLeft()
			ws.send(textutils.serializeJSON({move="l", nonce=obj.nonce}))

			blocks[i][3] = select(2,turtle.inspect())
			turtle.turnLeft()
			ws.send(textutils.serializeJSON({move="l", nonce=obj.nonce}))

			blocks[i][4] = select(2,turtle.inspect())
			ws.send(textutils.serializeJSON({blocks=blocks[i], nonce=obj.nonce}))
		end
	end
	return blocks
end

function goTo(obj, ws)
	local file
    print("GOTO")
	for i=1,20,1 do
		
			
				
	    local success = turtle.up()
		if not success then
			return res
		end
		ws.send(textutils.serializeJSON({move="u", nonce=obj.nonce}))
			
	end
    for i=1,obj.rot1 ,1 do
        turtle.turnRight()
        ws.send(textutils.serializeJSON({move="r", nonce=obj.nonce}))
    end
    for i=1,obj.st1 ,1 do
        local success = turtle.forward()
		if not success then
			return res
		end
		ws.send(textutils.serializeJSON({move="f", nonce=obj.nonce}))
    end
    for i=1,obj.rot2 ,1 do
        turtle.turnRight()
        ws.send(textutils.serializeJSON({move="r", nonce=obj.nonce}))
    end
    for i=1,obj.st2 ,1 do
        local success = turtle.forward()
		if not success then
			return res
		end
		ws.send(textutils.serializeJSON({move="f", nonce=obj.nonce}))
    end
    for i=1,obj.st3 ,1 do
        local success = turtle.down()
		if not success then
			return res
		end
		ws.send(textutils.serializeJSON({move="d", nonce=obj.nonce}))
    end
    return nil
end

function websocketLoop()
	
	local ws, err = http.websocket("ws://schmerver.mooo.com:57")
 
	if err then
		print(err)
	elseif ws then
		while true do
			term.clear()
			term.setCursorPos(1,1)
			local space = ""
			for i = 1,  (term.getSize() -3) * 0.5, 1 do
				space = space.." "
			end
			print("\n"..space.."{O}\n")
			print("Pog Turtle OS. Do not read my code unless you are 5Head.")
			local message = ws.receive()
			if message == nil then
				break
			end
			local obj = textutils.unserialiseJSON(message)
			if obj.type == 'eval' then
				print(obj['function'])
				local func = loadstring(obj['function'])
				local result = func()
				
				if type(result) == "table" then
					if not next(result) then
						result = textutils.empty_json_array
					end
				end
				print(textutils.serializeJSON(result))
				ws.send(textutils.serializeJSON({data=result, nonce=obj.nonce}))
			elseif obj.type == 'mitosis' then
				local status, res = pcall(undergoMitosis)
				if not status then
					ws.send(textutils.serializeJSON({data="null", nonce=obj.nonce}))
				elseif res == nil then
					ws.send(textutils.serializeJSON({data="null", nonce=obj.nonce}))
				else
					ws.send(textutils.serializeJSON({data=res, nonce=obj.nonce}))
				end
			elseif obj.type == 'mine' then
				local status, res = pcall(mineTunnel, obj, ws)
				ws.send(textutils.serializeJSON({data="end", nonce=obj.nonce}))
            elseif obj.type == 'goTo' then
                print("goTo")
            local status, res = pcall(goTo, obj, ws)
            ws.send(textutils.serializeJSON({data="end", nonce=obj.nonce}))
            end
		end
	end
	if ws then
		ws.close()
	end
end

while true do
	local status, res = pcall(websocketLoop)
	term.clear()
	term.setCursorPos(1,1)
	if res == 'Terminated' then
		print("You can't use straws to kill this turtle...")
		os.sleep(1)
		print("Read my code.")
		break
	end
	print(status,res)
	print("{O} I'm sleeping... please don't mine me :)")
	os.sleep(5)
end